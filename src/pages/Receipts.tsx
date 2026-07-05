import { useState, useEffect, useRef } from 'react';
import type { NavFilter } from '../App';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Wallet, Calendar, BarChart2, Receipt,
  Download, Filter, LayoutGrid, LayoutList, Star, Check, X, ChevronLeft, ChevronRight, MoreVertical,
} from 'lucide-react';

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

function methodBadge(method: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    cash:        { bg: '#dcfce7', text: '#16a34a' },
    bank:        { bg: '#dbeafe', text: '#1d4ed8' },
    cheque:      { bg: '#fef9c3', text: '#b45309' },
    transfer:    { bg: '#ede9fe', text: '#7c3aed' },
    card:        { bg: '#fce7f3', text: '#be185d' },
  };
  const key = (method || '').toLowerCase().split(' ')[0];
  const c = colors[key] || { bg: '#f3f4f6', text: '#6b7280' };
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: c.bg, color: c.text }}>{method || '—'}</span>;
}

interface RecFavorite { name: string; methodFilter: string; groupByVal: string; }
function loadRecFavorites(): RecFavorite[] { try { return JSON.parse(localStorage.getItem('rec_favorites') || '[]'); } catch { return []; } }
function saveRecFavorites(favs: RecFavorite[]) { localStorage.setItem('rec_favorites', JSON.stringify(favs)); }

export default function Receipts({ navFilter, onConsumeFilter }: { navFilter?: NavFilter | null; onConsumeFilter?: () => void } = {}) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const [receipts, setReceipts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    customer_id: '', invoice_id: '', amount: '', payment_method: '', reference: '', notes: '',
  });

  // Toolbar state
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'analytics'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMethod, setFilterMethod] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'method' | 'customer'>('none');
  const [favorites, setFavorites] = useState<RecFavorite[]>(loadRecFavorites());
  const [favName, setFavName] = useState('');
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const groupByRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);

  const [navFilterActive, setNavFilterActive] = useState<NavFilter | null>(null);
  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (navFilter) { setNavFilterActive(navFilter); onConsumeFilter?.(); } }, [navFilter]);

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
    const [recRes, invRes, allInvRes, custRes, coaRes, settRes] = await Promise.all([
      supabase.from('receipts').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('invoices').select('id,invoice_number,customer_name,customer_id,balance,total').eq('user_id', user.id).neq('status', 'Paid'),
      supabase.from('invoices').select('id,invoice_number,customer_name,total,balance,status').eq('user_id', user.id),
      supabase.from('customers').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('chart_of_accounts').select('id,code,name').eq('user_id', user.id).eq('sub_type', 'Cash & Bank').eq('is_active', true).order('code'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setReceipts(recRes.data || []);
    setInvoices(invRes.data || []);
    setAllInvoices(allInvRes.data || []);
    setCustomers(custRes.data || []);
    setCashBankAccounts(coaRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  function generateReceiptNumber(existing: any[]) {
    if (existing.length === 0) return 'REC-0001';
    const nums = existing.map(r => { const m = r.receipt_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'REC-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  const filteredInvoices = form.customer_id ? invoices.filter(i => i.customer_id === form.customer_id) : invoices;

  async function handleSave() {
    if (!form.customer_id || !form.invoice_id || !form.amount) return alert('Please fill all required fields');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return alert('Enter a valid amount');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const customer = customers.find(c => c.id === form.customer_id);
    const invoice = invoices.find(i => i.id === form.invoice_id);
    const recNumber = generateReceiptNumber(receipts);

    const { data: rec } = await supabase.from('receipts').insert({
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
    }).select().single();

    if (invoice) {
      const newPaid = invoice.total - invoice.balance + amount;
      const newBalance = Math.max(0, invoice.total - newPaid);
      await supabase.from('invoices').update({ paid_amount: newPaid, balance: newBalance, status: newBalance <= 0 ? 'Paid' : 'Partial' }).eq('id', form.invoice_id);
      const { data: cust } = await supabase.from('customers').select('balance').eq('id', form.customer_id).single();
      if (cust) await supabase.from('customers').update({ balance: Math.max(0, (cust.balance || 0) - amount) }).eq('id', form.customer_id);
    }

    setSaving(false);
    setShowForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], customer_id: '', invoice_id: '', amount: '', payment_method: '', reference: '', notes: '' });
    if (rec) exportPDF({ ...rec, customer_name: customer?.name }, invoice);
    loadData();
  }

  function exportPDF(rec: any, invoice?: any) {
    const doc = new jsPDF();
    const fmtN = (n: number) => (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
    doc.setFillColor(248, 249, 252); doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, 0, 4, 42, 'F');
    doc.setTextColor(79, 53, 200); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'Company Name', 12, 14);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
    doc.text('PAYMENT RECEIPT', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }
    doc.setTextColor(30, 30, 30); doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(rec.receipt_number, 198, 14, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + rec.date, 198, 22, { align: 'right' });
    doc.setDrawColor(79, 53, 200); doc.setLineWidth(0.5); doc.line(0, 42, 210, 42);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
    doc.text('RECEIVED FROM:', 12, 50);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(rec.customer_name || '—', 12, 57);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Payment Method: ' + rec.payment_method, 12, 63);
    if (rec.reference) doc.text('Reference: ' + rec.reference, 12, 68);
    doc.setFillColor(18, 183, 106); doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('RECEIVED', 172, 53, { align: 'center' });
    autoTable(doc, {
      startY: 76,
      head: [['Description', 'Invoice #', 'Amount (Rs.)']],
      body: [['Payment received', invoice?.invoice_number || '—', fmtN(rec.amount)]],
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 12, right: 12 },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFillColor(79, 53, 200); doc.rect(120, finalY, 78, 12, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('AMOUNT RECEIVED:', 125, finalY + 8); doc.text('Rs. ' + fmtN(rec.amount), 196, finalY + 8, { align: 'right' });
    if (rec.notes) { doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + rec.notes, 12, finalY + 22); }
    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252); doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150); doc.setFontSize(8);
    doc.text('Thank you for your payment!', 105, pageH - 6, { align: 'center' });
    doc.save(rec.receipt_number + '.pdf');
  }

  async function openDetail(r: any) {
    setSelected(r);
    const inv = allInvoices.find(i => i.id === r.invoice_id) || null;
    setSelectedInvoice(inv);
    setView('detail');
  }

  // KPI calculations
  const totalCollected = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  const now = new Date();
  const thisMonthTotal = receipts.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, r) => s + (r.amount || 0), 0);
  const avgReceipt = receipts.length > 0 ? totalCollected / receipts.length : 0;

  const filtered = receipts.filter(r => {
    if (navFilterActive?.field === 'invoice_id') return r.invoice_id === navFilterActive.value;
    if (navFilterActive?.field === 'customer_id') return r.customer_id === navFilterActive.value;
    const matchSearch = (r.receipt_number || '').toLowerCase().includes(search.toLowerCase()) || (r.customer_name || '').toLowerCase().includes(search.toLowerCase());
    const matchMethod = !filterMethod || (r.payment_method || '').toLowerCase().includes(filterMethod.toLowerCase());
    return matchSearch && matchMethod;
  });

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someSelected = filtered.some(r => selectedIds.has(r.id)) && !allSelected;
  function toggleSelectAll() { if (allSelected || someSelected) setSelectedIds(new Set()); else setSelectedIds(new Set(filtered.map(r => r.id))); }
  function toggleSelect(id: string) { const n = new Set(selectedIds); n.has(id) ? n.delete(id) : n.add(id); setSelectedIds(n); }

  function exportExcel() {
    const toExport = selectedIds.size > 0 ? receipts.filter(r => selectedIds.has(r.id)) : filtered;
    const data = toExport.map(r => ({ 'Receipt #': r.receipt_number, 'Date': r.date, 'Customer': r.customer_name, 'Amount': r.amount || 0, 'Method': r.payment_method || '', 'Invoice #': allInvoices.find(i => i.id === r.invoice_id)?.invoice_number || '', 'Reference': r.reference || '' }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Receipts');
    XLSX.writeFile(wb, `receipts_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const groups: { key: string; items: any[] }[] = [];
  if (groupBy === 'none') { groups.push({ key: '', items: filtered }); }
  else {
    const map = new Map<string, any[]>();
    filtered.forEach(r => {
      const k = groupBy === 'method' ? (r.payment_method || 'Unknown') : (r.customer_name || 'Unknown');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    map.forEach((items, key) => groups.push({ key, items }));
    groups.sort((a, b) => a.key.localeCompare(b.key));
  }

  function saveFav() {
    if (!favName.trim()) return;
    const newFavs = [...favorites, { name: favName.trim(), methodFilter: filterMethod, groupByVal: groupBy }];
    setFavorites(newFavs); saveRecFavorites(newFavs); setFavName('');
  }
  function loadFav(fav: RecFavorite) { setFilterMethod(fav.methodFilter); setGroupBy(fav.groupByVal as any); setShowFavorites(false); }
  function deleteFav(idx: number) { const newFavs = favorites.filter((_, i) => i !== idx); setFavorites(newFavs); saveRecFavorites(newFavs); }

  const activeFilterCount = filterMethod ? 1 : 0;
  const maxAmount = Math.max(...receipts.map(r => r.amount || 0), 1);

  // Get unique payment methods for filter
  const methodOptions = Array.from(new Set(receipts.map(r => r.payment_method).filter(Boolean)));

  // ── Detail view ──
  if (view === 'detail' && selected) {
    return (
      <div>
        <BackBtn label="Back to Receipts" onClick={() => { setView('list'); setSelected(null); }} />

        {/* Hero */}
        <div className="card" style={{ marginBottom: 16, padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 6 }}>{selected.receipt_number}</div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#16a34a' }}>Received</span>
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
                {selected.payment_method && (
                  <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {selected.payment_method}
                  </span>
                )}
                {selected.reference && (
                  <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    Ref: {selected.reference}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, flexShrink: 0, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Amount Received</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a', letterSpacing: '-0.5px' }}>{fmt(selected.amount)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => exportPDF(selected, selectedInvoice)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
              >PDF</button>
            </div>
          </div>
        </div>

        {/* Financial Overview */}
        <div className="card" style={{ marginBottom: 20, padding: '20px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Financial Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0 }}>
            {[
              { label: 'Amount', value: fmt(selected.amount), color: '#16a34a' },
              { label: 'Method', value: selected.payment_method || '—', color: 'var(--brand)' },
              { label: 'Invoice #', value: selectedInvoice?.invoice_number || '—', color: '#2563eb' },
              { label: 'Date', value: fmtDate(selected.date), color: 'var(--text1)' },
            ].map((k, i) => (
              <div key={k.label} style={{ paddingRight: i < 3 ? 28 : 0, borderRight: i < 3 ? '1px solid var(--border)' : 'none', paddingLeft: i > 0 ? 28 : 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontWeight: 500 }}>{k.label}</div>
                <div style={{ fontSize: i === 0 ? 18 : 15, fontWeight: 800, color: k.color, letterSpacing: '-0.4px' }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Linked invoice card */}
        {selectedInvoice && (
          <div className="card" style={{ marginBottom: 16, padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Linked Invoice</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0 }}>
              {[
                { label: 'Invoice #', value: selectedInvoice.invoice_number, color: 'var(--brand)' },
                { label: 'Total', value: fmt(selectedInvoice.total), color: 'var(--text1)' },
                { label: 'Balance', value: fmt(selectedInvoice.balance), color: selectedInvoice.balance > 0 ? '#dc2626' : '#16a34a' },
                { label: 'Status', value: selectedInvoice.status, color: 'var(--text1)' },
              ].map((k, i) => (
                <div key={k.label} style={{ paddingRight: i < 3 ? 28 : 0, borderRight: i < 3 ? '1px solid var(--border)' : 'none', paddingLeft: i > 0 ? 28 : 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontWeight: 500 }}>{k.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected.notes && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
            <strong>Notes:</strong> {selected.notes}
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
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 4 }}>Receipts</div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>Record and track payments received from customers.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ New Receipt'}</button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { icon: <Wallet size={22} color="#16a34a" />, label: 'Total Collected', value: fmt(totalCollected), sub: 'All time' },
          { icon: <Calendar size={22} color="var(--brand)" />, label: 'This Month', value: fmt(thisMonthTotal), sub: 'Current month' },
          { icon: <BarChart2 size={22} color="#d97706" />, label: 'Average Receipt', value: fmt(avgReceipt), sub: 'Per receipt' },
          { icon: <Receipt size={22} color="#0ea5e9" />, label: 'Total Count', value: String(receipts.length), sub: 'All receipts' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: k.label === 'Total Count' ? 28 : 16, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', lineHeight: 1 }}>{k.value}</div>
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
              <div className="inline-panel-title">New Receipt</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Next: {generateReceiptNumber(receipts)}</div>
            </div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Receipt Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Customer *</label>
                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value, invoice_id: '' })}>
                  <option value="">— Select Customer —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Invoice *</label>
                <select value={form.invoice_id} onChange={e => {
                  const inv = invoices.find(i => i.id === e.target.value);
                  setForm({ ...form, invoice_id: e.target.value, amount: inv ? String(inv.balance) : '' });
                }}>
                  <option value="">— Select Invoice —</option>
                  {filteredInvoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} — {i.customer_name} — Balance: {fmt(i.balance)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Amount (LKR) *</label>
                <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                  <option value="">— Select Account —</option>
                  {cashBankAccounts.map(a => <option key={a.id} value={`${a.code} - ${a.name}`}>{a.code} - {a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Reference</label>
                <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Cheque no, transfer ref..." />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save & Print Receipt'}</button>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {(activeFilterCount > 0 || navFilterActive) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {navFilterActive && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: '#ede9fe', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
              {navFilterActive.label ? `Filtered: ${navFilterActive.label}` : 'Filtered'}
              <button onClick={() => setNavFilterActive(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--brand)' }}><X size={12} /></button>
            </span>
          )}
          {filterMethod && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
              Method: {filterMethod}
              <button onClick={() => setFilterMethod('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--brand)' }}><X size={12} /></button>
            </span>
          )}
          <button onClick={() => { setFilterMethod(''); setNavFilterActive(null); }} style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Clear all</button>
        </div>
      )}

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)} style={{ padding: '7px 16px' }}>New</button>
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
            <input placeholder="Search receipts..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, width: 200 }} />
          </div>
          {/* Filters */}
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button onClick={() => { setShowFilters(!showFilters); setShowGroupBy(false); setShowFavorites(false); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1px solid ${showFilters || activeFilterCount > 0 ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 8, background: showFilters || activeFilterCount > 0 ? 'var(--brand-light)' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: showFilters || activeFilterCount > 0 ? 'var(--brand)' : 'var(--text2)' }}>
              <Filter size={13} /> Filters {activeFilterCount > 0 && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{activeFilterCount}</span>}
            </button>
            {showFilters && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 240, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Payment Method</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                    <input type="radio" name="recMethod" checked={filterMethod === ''} onChange={() => { setFilterMethod(''); setShowFilters(false); }} /> All Methods
                  </label>
                  {methodOptions.map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      <input type="radio" name="recMethod" checked={filterMethod === opt} onChange={() => { setFilterMethod(opt); setShowFilters(false); }} />{opt}
                    </label>
                  ))}
                  {methodOptions.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>No methods yet</div>}
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
                {[{ key: 'none', label: 'No Grouping' }, { key: 'method', label: 'By Method' }, { key: 'customer', label: 'By Customer' }].map(opt => (
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
            <h3>{search || filterMethod ? 'No receipts match' : 'No receipts yet'}</h3>
            <p>{search || filterMethod ? 'Try adjusting your search or filters' : 'Record payments received from customers'}</p>
            {!search && !filterMethod && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>+ New Receipt</button>}
          </div>
        ) : (
          <>
            <table>
              <thead><tr>
                <th style={{ width: 40 }}><input type="checkbox" ref={el => { if (el) el.indeterminate = someSelected; }} checked={allSelected} onChange={toggleSelectAll} /></th>
                <th>Receipt #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Invoice #</th><th style={{ width: 48 }}></th>
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
                    {group.items.map(r => (
                      <tr key={r.id} onClick={() => openDetail(r)} style={{ cursor: 'pointer', background: selectedIds.has(r.id) ? '#faf5ff' : undefined }}>
                        <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                        <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{r.receipt_number}</td>
                        <td style={{ color: 'var(--text2)' }}>{fmtDate(r.date)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={r.customer_name || 'U'} size={28} />{r.customer_name}</div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)}</td>
                        <td>{methodBadge(r.payment_method)}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>{allInvoices.find(i => i.id === r.invoice_id)?.invoice_number || '—'}</td>
                        <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                          <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowActionMenu(showActionMenu === r.id ? null : r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><MoreVertical size={16} color="var(--text3)" /></button>
                            {showActionMenu === r.id && (
                              <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 99, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', minWidth: 140, padding: 4 }}>
                                <button onClick={() => { setShowActionMenu(null); const inv = allInvoices.find(i => i.id === r.invoice_id); exportPDF(r, inv); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 7, color: 'var(--text1)', textAlign: 'left' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>PDF</button>
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
            {filtered.length === 0 ? <div className="empty-state"><h3>No receipts match</h3></div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {filtered.map(r => (
                  <div key={r.id} onClick={() => openDetail(r)} style={{ border: `2px solid ${selectedIds.has(r.id) ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer', background: '#fff', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                    onMouseEnter={e => { if (!selectedIds.has(r.id)) e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.1)'; }}
                    onMouseLeave={e => { if (!selectedIds.has(r.id)) e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand)' }}>{r.receipt_number}</span>
                      {methodBadge(r.payment_method)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Avatar name={r.customer_name || 'U'} size={26} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text1)' }}>{r.customer_name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>{fmtDate(r.date)}</div>
                    <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Amount</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{fmt(r.amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analytics view */}
        {viewMode === 'analytics' && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 16 }}>Amount by Receipt</div>
            {filtered.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 14 }}>No data to display.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...filtered].sort((a, b) => (b.amount || 0) - (a.amount || 0)).map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Avatar name={r.customer_name || 'U'} size={30} />
                    <div style={{ width: 110, fontSize: 13, fontWeight: 600, color: 'var(--brand)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.receipt_number}</div>
                    <div style={{ width: 120, fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer_name}</div>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(((r.amount || 0) / maxAmount) * 100, 0)}%`, background: 'linear-gradient(90deg, #16a34a, #4ade80)', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ width: 130, fontSize: 13, fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>{fmt(r.amount)}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { label: 'Total Collected', value: fmt(totalCollected) },
                { label: 'Average Receipt', value: fmt(avgReceipt) },
                { label: 'This Month', value: fmt(thisMonthTotal) },
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

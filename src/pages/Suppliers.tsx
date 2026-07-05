import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import {
  Users, TrendingDown, DollarSign, CreditCard,
  Mail, Phone, MapPin, ClipboardList, FileText, Wallet,
  Download, Filter, LayoutList, LayoutGrid, BarChart2,
  ChevronLeft, ChevronRight, MoreVertical, X, Search,
} from 'lucide-react';
import { SmartButton, SmartButtons } from '../components/SmartButton';
import { Chatter } from '../components/Chatter';
import type { NavFilter, Page } from '../App';

interface Supplier {
  id: string;
  supplier_code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  credit_limit: number;
  balance: number;
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

function exportExcel(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function Suppliers({ navTo }: { navTo?: (p: Page, filter?: NavFilter) => void }) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'analytics'>('list');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [groupBy, setGroupBy] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const filtersRef = useRef<HTMLDivElement>(null);
  const groupByRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [detailTab, setDetailTab] = useState<'orders' | 'bills' | 'payments'>('bills');
  const [detailBills, setDetailBills] = useState<any[]>([]);
  const [detailPOs, setDetailPOs] = useState<any[]>([]);
  const [detailPayments, setDetailPayments] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailKpi, setDetailKpi] = useState({ totalBilled: 0, totalPaid: 0, outstanding: 0 });

  useEffect(() => { loadSuppliers(); }, []);
  useEffect(() => {
    try { setFavorites(JSON.parse(localStorage.getItem('lx_suppliers_favorites') || '[]')); } catch { setFavorites([]); }
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

  async function loadSuppliers() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('suppliers').select('*').eq('user_id', user.id).order('name');
    setSuppliers(data || []);
    setLoading(false);
  }

  async function loadDetail(s: Supplier) {
    setDetailLoading(true);
    const [billRes, poRes, payRes] = await Promise.all([
      supabase.from('bills').select('*').eq('supplier_id', s.id).order('date', { ascending: false }).limit(20),
      supabase.from('purchase_orders').select('*').eq('supplier_id', s.id).order('date', { ascending: false }).limit(20),
      supabase.from('payments').select('*').eq('supplier_id', s.id).order('date', { ascending: false }).limit(20),
    ]);
    const bills = billRes.data || [];
    const payments = payRes.data || [];
    const totalBilled = bills.reduce((s, b) => s + (b.total || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    setDetailBills(bills);
    setDetailPOs(poRes.data || []);
    setDetailPayments(payments);
    setDetailKpi({ totalBilled, totalPaid, outstanding: totalBilled - totalPaid });
    setDetailLoading(false);
  }

  function openDetail(s: Supplier) {
    setSelected(s); setView('detail'); setDetailTab('bills'); loadDetail(s);
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, email: s.email || '', phone: s.phone || '', address: s.address || '', credit_limit: String(s.credit_limit || 0) });
    setShowForm(true);
    if (view === 'detail') setView('list');
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Supplier name is required');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await supabase.from('suppliers').update({ name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0 }).eq('id', editing.id);
    } else {
      await supabase.from('suppliers').insert({ user_id: user.id, supplier_code: 'SUPP-' + String(Date.now()).slice(-4), name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0, balance: 0 });
    }
    setSaving(false); setShowForm(false); loadSuppliers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this supplier?')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    if (view === 'detail') setView('list');
    loadSuppliers();
  }

  const filtered = suppliers.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.phone || '').includes(search);
    const matchFilter = !activeFilter ||
      (activeFilter === 'balance' && s.balance > 0) ||
      (activeFilter === 'nobalance' && s.balance <= 0);
    return matchSearch && matchFilter;
  });

  function getGroupKey(s: Supplier) {
    if (groupBy === 'tier') {
      if (s.credit_limit > 1000000) return 'VIP';
      if (s.credit_limit > 100000) return 'Standard';
      return 'Basic';
    }
    if (groupBy === 'city') return (s.address || '').split(',').pop()?.trim() || 'Unknown';
    return '';
  }

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  useEffect(() => {
    if (!selectAllRef.current) return;
    const pageIds = paged.map(s => s.id);
    const allSel = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    const someSel = pageIds.some(id => selectedIds.has(id));
    selectAllRef.current.checked = allSel;
    selectAllRef.current.indeterminate = someSel && !allSel;
  }, [selectedIds, paged]);

  function toggleSelectAll() {
    const pageIds = paged.map(s => s.id);
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
    const rows = selectedIds.size > 0 ? suppliers.filter(s => selectedIds.has(s.id)) : filtered;
    exportExcel(rows.map(s => ({ Code: s.supplier_code, Name: s.name, Email: s.email, Phone: s.phone, Address: s.address, 'Credit Limit': s.credit_limit, Balance: s.balance })), 'suppliers');
  }

  function saveFavorite(name: string) {
    const next = [...favorites, name];
    setFavorites(next);
    localStorage.setItem('lx_suppliers_favorites', JSON.stringify(next));
  }
  function removeFavorite(name: string) {
    const next = favorites.filter(f => f !== name);
    setFavorites(next);
    localStorage.setItem('lx_suppliers_favorites', JSON.stringify(next));
  }

  const totalCount = suppliers.length;
  const withPayables = suppliers.filter(s => s.balance > 0).length;
  const totalPayables = suppliers.reduce((s, sup) => s + (sup.balance || 0), 0);
  const avgCredit = totalCount > 0 ? suppliers.reduce((s, sup) => s + (sup.credit_limit || 0), 0) / totalCount : 0;

  const kpiCards = [
    { label: 'Total Suppliers', value: totalCount, sub: 'all time', color: '#2563eb', Icon: Users, filter: '' },
    { label: 'With Payables', value: withPayables, sub: 'balance > 0', color: '#dc2626', Icon: TrendingDown, filter: 'balance' },
    { label: 'Total Payables', value: fmt(totalPayables), sub: 'outstanding balance', color: '#7c3aed', Icon: DollarSign, filter: 'balance' },
    { label: 'Avg Credit Limit', value: fmt(avgCredit), sub: 'across all suppliers', color: '#6b7280', Icon: CreditCard, filter: '' },
  ];

  // ── Detail view ──
  if (view === 'detail' && selected) {
    return (
      <div>
        <BackBtn label="Back to Suppliers" onClick={() => { setView('list'); setSelected(null); }} />

        <div className="card" style={{ marginBottom: 16, padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1 }}>
              <Avatar name={selected.name} size={64} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.4px', marginBottom: 6 }}>{selected.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-purple">{selected.supplier_code}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {selected.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)' }}><Mail size={13} />{selected.email}</span>}
                  {selected.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)' }}><Phone size={13} />{selected.phone}</span>}
                  {selected.address && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)' }}><MapPin size={13} />{selected.address}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(selected)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected.id)}>Delete</button>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Outstanding</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: detailKpi.outstanding > 0 ? '#dc2626' : '#059669' }}>{fmt(detailKpi.outstanding)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Credit Limit</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{fmt(selected.credit_limit)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SmartButtons>
          <SmartButton icon={<ClipboardList size={18} />} value={detailPOs.length} label="Purchase Orders"
            onClick={navTo && selected ? () => navTo('purchaseorders', { field: 'supplier_id', value: selected.id, label: selected.name }) : undefined} />
          <SmartButton icon={<FileText size={18} />} value={detailBills.length} label="Bills"
            onClick={navTo && selected ? () => navTo('bills', { field: 'supplier_id', value: selected.id, label: selected.name }) : undefined} />
          <SmartButton icon={<CreditCard size={18} />} value={detailPayments.length} label="Payments"
            onClick={navTo && selected ? () => navTo('payments', { field: 'supplier_id', value: selected.id, label: selected.name }) : undefined} />
          <SmartButton icon={<Wallet size={18} />} value={fmt(detailKpi.outstanding)} label="Outstanding" forceActive={detailKpi.outstanding > 0} />
        </SmartButtons>

        <div className="card" style={{ marginBottom: 16, padding: '20px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>FINANCIAL OVERVIEW</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
            {[
              { label: 'Total Billed', value: fmt(detailKpi.totalBilled), color: '#7c3aed' },
              { label: 'Total Paid', value: fmt(detailKpi.totalPaid), color: '#059669' },
              { label: 'Outstanding', value: fmt(detailKpi.outstanding), color: detailKpi.outstanding > 0 ? '#dc2626' : '#059669' },
              { label: 'Credit Limit', value: fmt(selected.credit_limit), color: '#2563eb' },
            ].map((k, i) => (
              <div key={k.label} style={{ paddingTop: 20, paddingBottom: 4, paddingLeft: i === 0 ? 0 : 28, paddingRight: 28, borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
            <div style={{ display: 'flex' }}>
              {(['orders', 'bills', 'payments'] as const).map(t => (
                <button key={t} onClick={() => setDetailTab(t)} style={{
                  padding: '14px 20px', border: 'none', borderBottom: detailTab === t ? '2px solid var(--brand)' : '2px solid transparent',
                  background: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: detailTab === t ? 'var(--brand)' : 'var(--text2)', marginBottom: -1,
                }}>
                  {t === 'orders' ? `Purchase Orders (${detailPOs.length})` : t === 'bills' ? `Bills (${detailBills.length})` : `Payments (${detailPayments.length})`}
                </button>
              ))}
            </div>
          </div>

          {detailLoading ? (
            <div className="empty-state"><p>Loading...</p></div>
          ) : detailTab === 'orders' ? (
            detailPOs.length === 0 ? <div className="empty-state"><h3>No purchase orders yet</h3></div> : (
              <table>
                <thead><tr><th><input type="checkbox" /></th><th>PO #</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>{detailPOs.map(po => (
                  <tr key={po.id}>
                    <td><input type="checkbox" /></td>
                    <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{po.po_number}</td>
                    <td style={{ color: 'var(--text2)' }}>{fmtDate(po.date)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(po.total)}</td>
                    <td><span className="badge badge-purple">{po.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )
          ) : detailTab === 'bills' ? (
            detailBills.length === 0 ? <div className="empty-state"><h3>No bills yet</h3></div> : (
              <table>
                <thead><tr><th><input type="checkbox" /></th><th>Bill #</th><th>Date</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>{detailBills.map(b => (
                  <tr key={b.id}>
                    <td><input type="checkbox" /></td>
                    <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{b.bill_number}</td>
                    <td style={{ color: 'var(--text2)' }}>{fmtDate(b.date)}</td>
                    <td style={{ color: new Date(b.due_date) < new Date() && b.status !== 'Paid' ? '#dc2626' : 'var(--text2)' }}>{fmtDate(b.due_date)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(b.total)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(b.balance)}</td>
                    <td><span className={`badge ${b.status === 'Paid' ? 'badge-green' : b.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{b.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )
          ) : (
            detailPayments.length === 0 ? <div className="empty-state"><h3>No payments yet</h3></div> : (
              <table>
                <thead><tr><th><input type="checkbox" /></th><th>Payment #</th><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
                <tbody>{detailPayments.map(p => (
                  <tr key={p.id}>
                    <td><input type="checkbox" /></td>
                    <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{p.payment_number}</td>
                    <td style={{ color: 'var(--text2)' }}>{fmtDate(p.date)}</td>
                    <td style={{ color: '#dc2626', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.amount)}</td>
                    <td style={{ color: 'var(--text2)' }}>{p.payment_method || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )
          )}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text3)' }}>
            <span>{detailTab === 'orders' ? detailPOs.length : detailTab === 'bills' ? detailBills.length : detailPayments.length} records</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px' }}><ChevronLeft size={14} /></button>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px' }}><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>

        <Chatter recordType="supplier" recordId={selected.id} />

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">{editing ? 'Edit Supplier' : 'Add Supplier'}</div>
                <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group full"><label>Supplier Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="form-group full"><label>Address</label><textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} /></div>
                  <div className="form-group"><label>Credit Limit (LKR)</label><input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Supplier'}</button>
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
          <div className="page-title" style={{ fontSize: 26, fontWeight: 800 }}>Suppliers</div>
          <div className="page-sub">{suppliers.length} total suppliers</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>New</button>
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
            {activeFilter === 'balance' ? 'With Balance' : 'No Balance'}
            <button onClick={() => setActiveFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', padding: 0, display: 'flex' }}><X size={12} /></button>
          </span>
          <button onClick={() => setActiveFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12 }}>Clear all</button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>New</button>
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
              <input placeholder="Search suppliers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 30, height: 32, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', width: 200 }} />
            </div>

            <div style={{ position: 'relative' }} ref={filtersRef}>
              <button onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <Filter size={13} />Filters{activeFilter && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, fontSize: 10, padding: '0 5px', marginLeft: 2 }}>1</span>}
              </button>
              {showFilters && (
                <div style={{ position: 'absolute', top: 36, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, padding: 12, minWidth: 160 }}>
                  {[{ label: 'All', value: '' }, { label: 'With Balance', value: 'balance' }, { label: 'No Balance', value: 'nobalance' }].map(f => (
                    <label key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, fontSize: 13 }}>
                      <input type="radio" checked={activeFilter === f.value} onChange={() => { setActiveFilter(f.value); setPage(1); setShowFilters(false); }} />
                      {f.label}
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
                  {[{ label: 'None', value: '' }, { label: 'Credit Tier', value: 'tier' }, { label: 'City', value: 'city' }].map(g => (
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
            <h3>{search || activeFilter ? 'No suppliers found' : 'No suppliers yet'}</h3>
            <p>{search || activeFilter ? 'Try a different filter' : 'Add your first supplier to get started'}</p>
            {!search && !activeFilter && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>New Supplier</button>}
          </div>
        ) : viewMode === 'analytics' ? (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase' }}>Balance by Supplier</div>
            {filtered.filter(s => s.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10).map(s => (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(s.balance)}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#dc2626', borderRadius: 4, width: `${Math.min(100, (s.balance / (totalPayables || 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'kanban' ? (
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {paged.map(s => (
              <div key={s.id} className="card" style={{ padding: '16px 20px', cursor: 'pointer', border: selectedIds.has(s.id) ? '2px solid var(--brand)' : '1px solid var(--border)' }} onClick={() => openDetail(s)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <Avatar name={s.name} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.supplier_code}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>Balance</span>
                  <span style={{ fontWeight: 700, color: s.balance > 0 ? '#dc2626' : 'var(--text2)' }}>{fmt(s.balance)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" ref={selectAllRef} onChange={toggleSelectAll} /></th>
                <th>Code</th><th>Name</th><th>Email</th><th>Phone</th><th>Credit Limit</th><th>Balance</th><th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {groupBy ? (() => {
                const groups: Record<string, Supplier[]> = {};
                paged.forEach(s => { const k = getGroupKey(s); if (!groups[k]) groups[k] = []; groups[k].push(s); });
                return Object.entries(groups).flatMap(([group, rows]) => [
                  <tr key={`g-${group}`} style={{ background: 'var(--bg)', cursor: 'default' }}>
                    <td colSpan={8} style={{ fontWeight: 700, fontSize: 12, color: 'var(--text3)', padding: '8px 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group} ({rows.length})</td>
                  </tr>,
                  ...rows.map(s => <SupplierRow key={s.id} s={s} selectedIds={selectedIds} toggleSelect={toggleSelect} openDetail={openDetail} openEdit={openEdit} handleDelete={handleDelete} />),
                ]);
              })() : paged.map(s => <SupplierRow key={s.id} s={s} selectedIds={selectedIds} toggleSelect={toggleSelect} openDetail={openDetail} openEdit={openEdit} handleDelete={handleDelete} />)}
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

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Supplier' : 'Add New Supplier'}</div>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full"><label>Supplier Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. XYZ Traders" /></div>
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@supplier.lk" /></div>
                <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+94 XX XXX XXXX" /></div>
                <div className="form-group full"><label>Address</label><textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, City" rows={2} /></div>
                <div className="form-group"><label>Credit Limit (LKR)</label><input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Supplier'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierRow({ s, selectedIds, toggleSelect, openDetail, openEdit, handleDelete }: {
  s: Supplier; selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openDetail: (s: Supplier) => void;
  openEdit: (s: Supplier) => void;
  handleDelete: (id: string) => void;
}) {
  const fmtR = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const [menuOpen, setMenuOpen] = useState(false);
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2'];
  const bg = colors[(s.name?.charCodeAt(0) || 0) % colors.length];
  const initials = s.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <tr onClick={() => openDetail(s)} style={{ cursor: 'pointer', background: selectedIds.has(s.id) ? 'var(--brand-light)' : '' }}>
      <td onClick={e => { e.stopPropagation(); toggleSelect(s.id); }}><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} /></td>
      <td style={{ color: 'var(--text3)', fontSize: 12 }}>{s.supplier_code}</td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          <span style={{ fontWeight: 600 }}>{s.name}</span>
        </div>
      </td>
      <td style={{ color: 'var(--text2)' }}>{s.email || '—'}</td>
      <td style={{ color: 'var(--text2)' }}>{s.phone || '—'}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtR(s.credit_limit)}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: s.balance > 0 ? '#dc2626' : 'var(--text1)' }}>{fmtR(s.balance)}</td>
      <td onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <MoreVertical size={15} color="var(--text3)" />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 28, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 120 }}>
              <button onClick={() => { openEdit(s); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>Edit</button>
              <button onClick={() => { handleDelete(s.id); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#dc2626' }}>Delete</button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

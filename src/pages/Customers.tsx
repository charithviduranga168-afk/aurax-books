import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import {
  Mail, Phone, MapPin, Globe, FileText, CreditCard, Users,
  ShoppingCart, Receipt, Wallet, Download, Filter, LayoutGrid,
  LayoutList, Pencil, Trash2, ChevronLeft, ChevronRight,
  MoreVertical, Star, X, Check, BarChart2,
} from 'lucide-react';
import { SmartButton, SmartButtons } from '../components/SmartButton';
import { Chatter } from '../components/Chatter';

interface Customer {
  id: string;
  customer_code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  credit_limit: number;
  balance: number;
  created_at: string;
}

interface Props { onBack?: () => void; }

const fmt = (n: number) =>
  'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-GB') : '—';

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const color = colors[name.charCodeAt(0) % colors.length];
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

// ── Customer Detail ───────────────────────────────────────────────
function CustomerDetail({ customer, onBack, onEdit, onDelete }: {
  customer: Customer; onBack: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [tab, setTab] = useState<'invoices' | 'payments' | 'salesorders'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [portalEmail, setPortalEmail] = useState(customer.email || '');
  const [portalMsg, setPortalMsg] = useState('');
  const [portalSaving, setPortalSaving] = useState(false);
  const [showPortal, setShowPortal] = useState(false);
  const [tabSearch, setTabSearch] = useState('');

  useEffect(() => {
    setLoadingData(true);
    Promise.all([
      supabase.from('invoices').select('id,invoice_number,invoice_date,due_date,total,paid,status').eq('customer_id', customer.id).order('invoice_date', { ascending: false }).limit(50),
      supabase.from('receipts').select('id,receipt_number,receipt_date,amount,payment_method').eq('customer_id', customer.id).order('receipt_date', { ascending: false }).limit(50),
      supabase.from('sales_orders').select('id,so_number,date,total,status').eq('customer_id', customer.id).order('date', { ascending: false }).limit(50),
    ]).then(([inv, rec, sos]) => {
      setInvoices(inv.data || []);
      setReceipts(rec.data || []);
      setSalesOrders(sos.data || []);
      setLoadingData(false);
    });
  }, [customer.id]);

  async function grantPortal() {
    if (!portalEmail.trim()) return;
    setPortalSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('customer_portal_users').upsert({
      customer_id: customer.id, invite_email: portalEmail.trim().toLowerCase(),
      admin_user_id: user.id, is_active: true, user_id: null,
    }, { onConflict: 'invite_email' });
    setPortalSaving(false);
    setPortalMsg(error ? ('Error: ' + error.message) : '✓ Portal access granted for ' + portalEmail.trim());
  }

  const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paid || 0), 0);
  const outstanding = totalInvoiced - totalPaid;

  const tabs = [
    { key: 'invoices' as const, label: `Invoices (${invoices.length})` },
    { key: 'payments' as const, label: `Payments (${receipts.length})` },
    { key: 'salesorders' as const, label: `Sales Orders (${salesOrders.length})` },
  ];

  const statusColor = (s: string) => {
    const map: Record<string, string> = { paid: '#16a34a', partial: '#d97706', unpaid: '#dc2626', overdue: '#dc2626', cancelled: '#6b7280', confirmed: '#7c3aed', draft: '#6b7280', sent: '#0ea5e9' };
    return map[(s || '').toLowerCase()] || 'var(--text2)';
  };
  const statusBg = (s: string) => {
    const map: Record<string, string> = { paid: '#dcfce7', partial: '#fef3c7', unpaid: '#fee2e2', overdue: '#fee2e2', cancelled: '#f3f4f6', confirmed: '#ede9fe', draft: '#f3f4f6', sent: '#e0f2fe' };
    return map[(s || '').toLowerCase()] || '#f3f4f6';
  };

  return (
    <div>
      <BackBtn label="Back to Customers" onClick={onBack} />

      {/* Hero Card */}
      <div className="card" style={{ marginBottom: 16, padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flex: 1, minWidth: 0 }}>
            <Avatar name={customer.name} size={72} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 6 }}>{customer.name}</div>
              <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                {customer.customer_code}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 4 }}>
                {customer.email && <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={13} color="var(--text3)" />{customer.email}</span>}
                {customer.phone && <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={13} color="var(--text3)" />{customer.phone}</span>}
                {customer.address && <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} color="var(--text3)" />{customer.address}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 40, flexShrink: 0, alignItems: 'flex-start' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Credit Limit</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{fmt(customer.credit_limit)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Outstanding</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: outstanding > 0 ? '#ef4444' : '#16a34a' }}>{fmt(outstanding)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {[
              { label: 'Portal', icon: <Globe size={14} />, onClick: () => setShowPortal(!showPortal), danger: false },
              { label: 'Edit', icon: <Pencil size={14} />, onClick: onEdit, danger: false },
              { label: 'Delete', icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: btn.danger ? '1px solid #fecaca' : '1px solid var(--border)',
                background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: btn.danger ? '#dc2626' : 'var(--text1)', transition: 'background 0.15s, border-color 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = btn.danger ? '#fee2e2' : 'var(--bg)'; if (!btn.danger) e.currentTarget.style.borderColor = 'var(--brand)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; if (!btn.danger) e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {btn.icon} {btn.label}
              </button>
            ))}
          </div>
        </div>
        {showPortal && (
          <div style={{ marginTop: 20, padding: '16px 20px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Grant Customer Portal Access</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="email" value={portalEmail} onChange={e => setPortalEmail(e.target.value)} placeholder="customer@example.com" style={{ flex: 1, maxWidth: 320 }} />
              <button className="btn btn-primary btn-sm" onClick={grantPortal} disabled={portalSaving || !portalEmail.trim()}>
                {portalSaving ? 'Saving...' : 'Grant Access'}
              </button>
            </div>
            {portalMsg && <div style={{ marginTop: 8, fontSize: 13, color: portalMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{portalMsg}</div>}
          </div>
        )}
      </div>

      <SmartButtons>
        <SmartButton icon={<ShoppingCart size={18} />} value={salesOrders.length} label="Sales Orders" onClick={() => setTab('salesorders')} />
        <SmartButton icon={<FileText size={18} />} value={invoices.length} label="Invoices" onClick={() => setTab('invoices')} />
        <SmartButton icon={<Receipt size={18} />} value={receipts.length} label="Receipts" onClick={() => setTab('payments')} />
        <SmartButton icon={<Wallet size={18} />} value={receipts.length} label="Payments" onClick={() => setTab('payments')} />
      </SmartButtons>

      {/* Financial Overview */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Financial Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0 }}>
          {[
            { label: 'Total Invoiced', value: fmt(totalInvoiced), color: 'var(--brand)' },
            { label: 'Total Paid', value: fmt(totalPaid), color: '#16a34a' },
            { label: 'Outstanding', value: fmt(outstanding), color: outstanding > 0 ? '#ef4444' : '#16a34a' },
            { label: 'Credit Limit', value: fmt(customer.credit_limit), color: '#3b82f6' },
          ].map((k, i) => (
            <div key={k.label} style={{ paddingRight: i < 3 ? 28 : 0, borderRight: i < 3 ? '1px solid var(--border)' : 'none', paddingLeft: i > 0 ? 28 : 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontWeight: 500 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.color, letterSpacing: '-0.4px' }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs + Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          <div style={{ display: 'flex', flex: 1 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setTabSearch(''); }} style={{
                padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: tab === t.key ? 'var(--brand)' : 'var(--text2)',
                borderBottom: tab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
                transition: 'all 0.15s', marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input value={tabSearch} onChange={e => setTabSearch(e.target.value)}
                placeholder={`Search ${tab === 'invoices' ? 'invoices' : tab === 'payments' ? 'payments' : 'orders'}...`}
                style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, width: 180 }}
              />
            </div>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>
              <Filter size={13} /> Filters
            </button>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button style={{ padding: '7px 10px', border: 'none', background: 'var(--brand-light)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <LayoutList size={14} color="var(--brand)" />
              </button>
              <button style={{ padding: '7px 10px', border: 'none', background: '#fff', borderLeft: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <LayoutGrid size={14} color="var(--text3)" />
              </button>
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : tab === 'invoices' ? (
          invoices.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><FileText size={32} color="#7c3aed" /></div>
              <h3>No invoices yet</h3><p>Invoices for this customer will appear here.</p>
            </div>
          ) : (
            <table><thead><tr>
              <th style={{ width: 40 }}><input type="checkbox" /></th>
              <th>Invoice #</th><th>Date</th><th>Due Date</th><th>Status</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Actions</th>
            </tr></thead><tbody>
              {invoices.filter(i => !tabSearch || (i.invoice_number || '').toLowerCase().includes(tabSearch.toLowerCase())).map(inv => (
                <tr key={inv.id}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                  <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{inv.invoice_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{fmtDate(inv.invoice_date)}</td>
                  <td style={{ color: 'var(--text2)' }}>{fmtDate(inv.due_date)}</td>
                  <td><span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: statusColor(inv.status), background: statusBg(inv.status) }}>{inv.status}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.total)}</td>
                  <td style={{ color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.paid)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt((inv.total || 0) - (inv.paid || 0))}</td>
                  <td><button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><MoreVertical size={15} color="var(--text3)" /></button></td>
                </tr>
              ))}
            </tbody></table>
          )
        ) : tab === 'payments' ? (
          receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CreditCard size={32} color="#7c3aed" /></div>
              <h3>No payments yet</h3><p>Payments from this customer will appear here.</p>
            </div>
          ) : (
            <table><thead><tr>
              <th style={{ width: 40 }}><input type="checkbox" /></th>
              <th>Receipt #</th><th>Date</th><th>Amount</th><th>Method</th><th>Actions</th>
            </tr></thead><tbody>
              {receipts.filter(r => !tabSearch || (r.receipt_number || '').toLowerCase().includes(tabSearch.toLowerCase())).map(r => (
                <tr key={r.id}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                  <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{r.receipt_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{fmtDate(r.receipt_date)}</td>
                  <td style={{ color: '#16a34a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)}</td>
                  <td style={{ color: 'var(--text2)' }}>{r.payment_method || '—'}</td>
                  <td><button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><MoreVertical size={15} color="var(--text3)" /></button></td>
                </tr>
              ))}
            </tbody></table>
          )
        ) : (
          salesOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><ShoppingCart size={32} color="#7c3aed" /></div>
              <h3>No sales orders yet</h3><p>Sales orders for this customer will appear here.</p>
            </div>
          ) : (
            <table><thead><tr>
              <th style={{ width: 40 }}><input type="checkbox" /></th>
              <th>SO #</th><th>Date</th><th>Status</th><th>Total</th><th>Actions</th>
            </tr></thead><tbody>
              {salesOrders.filter(s => !tabSearch || (s.so_number || '').toLowerCase().includes(tabSearch.toLowerCase())).map(so => (
                <tr key={so.id}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                  <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{so.so_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{fmtDate(so.date)}</td>
                  <td><span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: statusColor(so.status), background: statusBg(so.status) }}>{so.status}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(so.total)}</td>
                  <td><button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><MoreVertical size={15} color="var(--text3)" /></button></td>
                </tr>
              ))}
            </tbody></table>
          )
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)' }}>
          <span>Showing {tab === 'invoices' ? invoices.length : tab === 'payments' ? receipts.length : salesOrders.length} of {tab === 'invoices' ? invoices.length : tab === 'payments' ? receipts.length : salesOrders.length}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{tab === 'invoices' ? (invoices.length === 0 ? '1-0 of 0' : `1-${invoices.length} of ${invoices.length}`) : tab === 'payments' ? (receipts.length === 0 ? '1-0 of 0' : `1-${receipts.length} of ${receipts.length}`) : (salesOrders.length === 0 ? '1-0 of 0' : `1-${salesOrders.length} of ${salesOrders.length}`)}</span>
            <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronLeft size={14} color="var(--text3)" /></button>
            <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronRight size={14} color="var(--text3)" /></button>
          </div>
        </div>
      </div>

      <Chatter recordType="customer" recordId={customer.id} />
    </div>
  );
}

// ── Saved Favorites type ──────────────────────────────────────────
interface Favorite { name: string; filters: FilterState; }
interface FilterState {
  balance: 'all' | 'has' | 'zero';
  creditLimit: 'all' | 'none' | 'low' | 'high';
}

const DEFAULT_FILTER: FilterState = { balance: 'all', creditLimit: 'all' };

function loadFavorites(): Favorite[] {
  try { return JSON.parse(localStorage.getItem('customer_favorites') || '[]'); } catch { return []; }
}
function saveFavorites(favs: Favorite[]) {
  localStorage.setItem('customer_favorites', JSON.stringify(favs));
}

// ── Customers List ────────────────────────────────────────────────
export default function Customers({ onBack }: Props) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'analytics'>('list');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
  const [saving, setSaving] = useState(false);

  // Select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER);
  const [pendingFilters, setPendingFilters] = useState<FilterState>(DEFAULT_FILTER);
  const filterRef = useRef<HTMLDivElement>(null);

  // Group By
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'creditTier' | 'city'>('none');
  const groupByRef = useRef<HTMLDivElement>(null);

  // Favorites
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>(loadFavorites());
  const [favName, setFavName] = useState('');
  const favRef = useRef<HTMLDivElement>(null);

  // Action menu per row
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);

  useEffect(() => { loadCustomers(); }, []);

  // Close dropdowns on outside click
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

  async function loadCustomers() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('customers').select('*').eq('user_id', user.id).order('name');
    setCustomers(data || []);
    setLoading(false);
  }

  function openAdd() { setEditing(null); setForm({ name: '', email: '', phone: '', address: '', credit_limit: '0' }); setShowForm(true); }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', credit_limit: String(c.credit_limit || 0) });
    setShowForm(true);
    if (view === 'detail') setView('list');
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Customer name is required');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await supabase.from('customers').update({ name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0 }).eq('id', editing.id);
    } else {
      await supabase.from('customers').insert({ user_id: user.id, customer_code: 'CUST-' + String(Date.now()).slice(-4), name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0, balance: 0 });
    }
    setSaving(false); setShowForm(false); loadCustomers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this customer?')) return;
    await supabase.from('customers').delete().eq('id', id);
    if (view === 'detail') setView('list');
    loadCustomers();
  }

  // ── Apply filters ──
  function applyFilter(c: Customer): boolean {
    if (filters.balance === 'has' && !(c.balance > 0)) return false;
    if (filters.balance === 'zero' && c.balance > 0) return false;
    if (filters.creditLimit === 'none' && c.credit_limit > 0) return false;
    if (filters.creditLimit === 'low' && !(c.credit_limit > 0 && c.credit_limit < 100000)) return false;
    if (filters.creditLimit === 'high' && !(c.credit_limit >= 100000)) return false;
    return true;
  }

  const activeFilterCount = (filters.balance !== 'all' ? 1 : 0) + (filters.creditLimit !== 'all' ? 1 : 0);

  const filtered = customers.filter(c =>
    (c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search)) && applyFilter(c)
  );

  // ── Group By logic ──
  function getCreditTier(c: Customer) {
    if (!c.credit_limit) return 'No Limit';
    if (c.credit_limit >= 100000) return 'High (≥ Rs. 100k)';
    return 'Low (< Rs. 100k)';
  }

  function getCity(c: Customer) {
    const parts = (c.address || '').split(',');
    return parts[parts.length - 1].trim() || 'Unknown';
  }

  function getGroupKey(c: Customer) {
    if (groupBy === 'creditTier') return getCreditTier(c);
    if (groupBy === 'city') return getCity(c);
    return '';
  }

  const groups: { key: string; items: Customer[] }[] = [];
  if (groupBy === 'none') {
    groups.push({ key: '', items: filtered });
  } else {
    const map = new Map<string, Customer[]>();
    filtered.forEach(c => {
      const k = getGroupKey(c);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    });
    map.forEach((items, key) => groups.push({ key, items }));
    groups.sort((a, b) => a.key.localeCompare(b.key));
  }

  // ── Select all ──
  const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
  const someSelected = filtered.some(c => selectedIds.has(c.id)) && !allSelected;

  function toggleSelectAll() {
    if (allSelected || someSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  // ── Excel Export ──
  function exportExcel() {
    const toExport = selectedIds.size > 0
      ? customers.filter(c => selectedIds.has(c.id))
      : filtered;

    const data = toExport.map(c => ({
      'Customer Code': c.customer_code,
      'Name': c.name,
      'Email': c.email || '',
      'Phone': c.phone || '',
      'Address': c.address || '',
      'Credit Limit (LKR)': c.credit_limit || 0,
      'Balance (LKR)': c.balance || 0,
      'Created At': c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    // Column widths
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 30 }, { wch: 16 }, { wch: 35 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, `customers_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ── Favorites ──
  function saveFav() {
    if (!favName.trim()) return;
    const newFavs = [...favorites, { name: favName.trim(), filters }];
    setFavorites(newFavs);
    saveFavorites(newFavs);
    setFavName('');
  }

  function loadFav(fav: Favorite) {
    setFilters(fav.filters);
    setPendingFilters(fav.filters);
    setShowFavorites(false);
  }

  function deleteFav(idx: number) {
    const newFavs = favorites.filter((_, i) => i !== idx);
    setFavorites(newFavs);
    saveFavorites(newFavs);
  }

  const totalBalance = customers.reduce((s, c) => s + (c.balance || 0), 0);

  if (view === 'detail' && selected) {
    return (
      <CustomerDetail
        customer={selected}
        onBack={() => { setView('list'); setSelected(null); }}
        onEdit={() => openEdit(selected)}
        onDelete={() => handleDelete(selected.id)}
      />
    );
  }

  // ── Analytics view helpers ──
  const maxBal = Math.max(...customers.map(c => c.balance || 0), 1);

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 4 }}>Customers</div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>Manage your customers and their account details.</div>
        </div>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : openAdd())}>
          {showForm ? 'Close' : '+ Add Customer'}
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="inline-panel" style={{ marginBottom: 20 }}>
          <div className="inline-panel-header">
            <div className="inline-panel-title">{editing ? 'Edit Customer' : 'Add New Customer'}</div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group full"><label>Customer Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. ABC Company" /></div>
              <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@company.lk" /></div>
              <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+94 XX XXX XXXX" /></div>
              <div className="form-group full"><label>Address</label><textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, City" rows={2} /></div>
              <div className="form-group"><label>Credit Limit (LKR)</label><input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} placeholder="0" /></div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Customer'}</button>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { icon: <Users size={22} color="var(--brand)" />, label: 'Total Customers', value: customers.length, sub: 'All registered customers', isNum: true },
          { icon: <Wallet size={22} color="var(--brand)" />, label: 'Total Balance', value: fmt(totalBalance), sub: 'Total outstanding balance', isNum: false },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {filters.balance !== 'all' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
              Balance: {filters.balance === 'has' ? 'Has Balance' : 'Zero Balance'}
              <button onClick={() => setFilters(f => ({ ...f, balance: 'all' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--brand)' }}><X size={12} /></button>
            </span>
          )}
          {filters.creditLimit !== 'all' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
              Credit: {filters.creditLimit === 'none' ? 'No Limit' : filters.creditLimit === 'low' ? 'Low' : 'High'}
              <button onClick={() => setFilters(f => ({ ...f, creditLimit: 'all' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--brand)' }}><X size={12} /></button>
            </span>
          )}
          <button onClick={() => setFilters(DEFAULT_FILTER)} style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Clear all</button>
        </div>
      )}

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ padding: '7px 16px' }}>New</button>
          <button
            onClick={exportExcel}
            title={selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export all to Excel'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8,
              background: '#fff', cursor: 'pointer', position: 'relative',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <Download size={14} color="var(--text2)" />
            {selectedIds.size > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6, width: 16, height: 16,
                background: 'var(--brand)', color: '#fff', borderRadius: '50%',
                fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{selectedIds.size}</span>
            )}
          </button>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, width: 200 }} />
          </div>

          {/* Filters */}
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button onClick={() => { setPendingFilters(filters); setShowFilters(!showFilters); setShowGroupBy(false); setShowFavorites(false); }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', border: `1px solid ${showFilters || activeFilterCount > 0 ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 8,
              background: showFilters || activeFilterCount > 0 ? 'var(--brand-light)' : '#fff',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: showFilters || activeFilterCount > 0 ? 'var(--brand)' : 'var(--text2)',
            }}>
              <Filter size={13} /> Filters {activeFilterCount > 0 && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{activeFilterCount}</span>}
            </button>

            {showFilters && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 280, padding: 20,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Balance</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                  {[{ key: 'all', label: 'All' }, { key: 'has', label: 'Has Balance' }, { key: 'zero', label: 'Zero Balance' }].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      <input type="radio" name="balance" checked={pendingFilters.balance === opt.key} onChange={() => setPendingFilters(f => ({ ...f, balance: opt.key as any }))} />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Credit Limit</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                  {[{ key: 'all', label: 'All' }, { key: 'none', label: 'No Credit Limit (0)' }, { key: 'low', label: 'Low (< Rs. 100k)' }, { key: 'high', label: 'High (≥ Rs. 100k)' }].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      <input type="radio" name="creditLimit" checked={pendingFilters.creditLimit === opt.key} onChange={() => setPendingFilters(f => ({ ...f, creditLimit: opt.key as any }))} />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => { setPendingFilters(DEFAULT_FILTER); setFilters(DEFAULT_FILTER); setShowFilters(false); }} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Reset</button>
                  <button onClick={() => { setFilters(pendingFilters); setShowFilters(false); }} className="btn btn-primary btn-sm">Apply</button>
                </div>
              </div>
            )}
          </div>

          {/* Group By */}
          <div style={{ position: 'relative' }} ref={groupByRef}>
            <button onClick={() => { setShowGroupBy(!showGroupBy); setShowFilters(false); setShowFavorites(false); }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', border: `1px solid ${groupBy !== 'none' ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 8,
              background: groupBy !== 'none' ? 'var(--brand-light)' : '#fff',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: groupBy !== 'none' ? 'var(--brand)' : 'var(--text2)',
            }}>
              <LayoutGrid size={13} /> Group By {groupBy !== 'none' && <Check size={12} />}
            </button>

            {showGroupBy && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 220, padding: 8,
              }}>
                {[{ key: 'none', label: 'No Grouping' }, { key: 'creditTier', label: 'Credit Limit Tier' }, { key: 'city', label: 'City / Location' }].map(opt => (
                  <button key={opt.key} onClick={() => { setGroupBy(opt.key as any); setShowGroupBy(false); }} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '9px 14px', border: 'none',
                    background: groupBy === opt.key ? 'var(--brand-light)' : 'none',
                    color: groupBy === opt.key ? 'var(--brand)' : 'var(--text1)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 8, textAlign: 'left',
                  }}>
                    {opt.label}
                    {groupBy === opt.key && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Favorites */}
          <div style={{ position: 'relative' }} ref={favRef}>
            <button onClick={() => { setShowFavorites(!showFavorites); setShowFilters(false); setShowGroupBy(false); }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', border: `1px solid ${favorites.length > 0 ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 8,
              background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: favorites.length > 0 ? 'var(--brand)' : 'var(--text2)',
            }}>
              <Star size={13} /> Favorites {favorites.length > 0 && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{favorites.length}</span>}
            </button>

            {showFavorites && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 260, padding: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Save Current Filters</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input value={favName} onChange={e => setFavName(e.target.value)} placeholder="Favorite name..." style={{ flex: 1, fontSize: 13 }} onKeyDown={e => e.key === 'Enter' && saveFav()} />
                  <button onClick={saveFav} disabled={!favName.trim()} className="btn btn-primary btn-sm">Save</button>
                </div>
                {favorites.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Saved</div>
                    {favorites.map((fav, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < favorites.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <button onClick={() => loadFav(fav)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text1)', textAlign: 'left', padding: '2px 0' }}>
                          <Star size={12} style={{ marginRight: 6 }} color="var(--brand)" />{fav.name}
                        </button>
                        <button onClick={() => deleteFav(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={13} /></button>
                      </div>
                    ))}
                  </>
                )}
                {favorites.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>No saved favorites yet</div>}
              </div>
            )}
          </div>

          {/* Pagination count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ fontWeight: 500 }}>{filtered.length > 0 ? `1-${filtered.length} / ${filtered.length}` : '0 / 0'}</span>
            <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronLeft size={13} color="var(--text3)" /></button>
            <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronRight size={13} color="var(--text3)" /></button>
          </div>

          {/* View toggles */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { mode: 'list' as const, icon: <LayoutList size={15} /> },
              { mode: 'kanban' as const, icon: <LayoutGrid size={15} /> },
              { mode: 'analytics' as const, icon: <BarChart2 size={15} /> },
            ].map((v, i) => (
              <button key={v.mode} onClick={() => setViewMode(v.mode)} style={{
                padding: '7px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                background: viewMode === v.mode ? 'var(--brand-light)' : '#fff',
                color: viewMode === v.mode ? 'var(--brand)' : 'var(--text3)',
                borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              }}>{v.icon}</button>
            ))}
          </div>
        </div>

        {/* ── List view ── */}
        {viewMode === 'list' && (
          loading ? (
            <div className="empty-state"><p>Loading...</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Users size={32} color="#7c3aed" /></div>
              <h3>{search || activeFilterCount > 0 ? 'No customers match' : 'No customers yet'}</h3>
              <p>{search || activeFilterCount > 0 ? 'Try adjusting your search or filters' : 'Add your first customer to get started'}</p>
              {!search && activeFilterCount === 0 && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>+ Add Customer</button>}
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        checked={allSelected}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Credit Limit</th>
                    <th>Balance</th>
                    <th style={{ width: 48 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => (
                    <>
                      {groupBy !== 'none' && (
                        <tr key={`group-${group.key}`} style={{ background: 'var(--bg)' }}>
                          <td colSpan={6} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {group.key} <span style={{ fontWeight: 400, color: 'var(--text3)', textTransform: 'none' }}>({group.items.length})</span>
                          </td>
                        </tr>
                      )}
                      {group.items.map(c => (
                        <tr key={c.id} onClick={() => { setSelected(c); setView('detail'); }} style={{ cursor: 'pointer', background: selectedIds.has(c.id) ? '#faf5ff' : undefined }}>
                          <td onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <Avatar name={c.name} size={36} />
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text1)', fontSize: 14 }}>{c.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{c.customer_code}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{c.email || '—'}</div>
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{c.phone || ''}</div>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text2)', fontSize: 14 }}>{fmt(c.credit_limit)}</td>
                          <td>
                            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 14, color: c.balance > 0 ? 'var(--brand)' : 'var(--text1)' }}>
                              {fmt(c.balance)}
                            </span>
                          </td>
                          <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                            <div style={{ position: 'relative' }}>
                              <button onClick={() => setShowActionMenu(showActionMenu === c.id ? null : c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                              >
                                <MoreVertical size={16} color="var(--text3)" />
                              </button>
                              {showActionMenu === c.id && (
                                <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 99, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', minWidth: 140, padding: 4 }}>
                                  {[
                                    { label: 'Edit', icon: <Pencil size={13} />, action: () => { setShowActionMenu(null); openEdit(c); }, danger: false },
                                    { label: 'Delete', icon: <Trash2 size={13} />, action: () => { setShowActionMenu(null); handleDelete(c.id); }, danger: true },
                                  ].map(item => (
                                    <button key={item.label} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 7, color: item.danger ? '#dc2626' : 'var(--text1)', textAlign: 'left' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = item.danger ? '#fee2e2' : 'var(--bg)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                    >{item.icon} {item.label}</button>
                                  ))}
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
          )
        )}

        {/* ── Kanban view ── */}
        {viewMode === 'kanban' && (
          <div style={{ padding: 20 }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Users size={32} color="#7c3aed" /></div>
                <h3>No customers match</h3>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {filtered.map(c => (
                  <div key={c.id} onClick={() => { setSelected(c); setView('detail'); }} style={{ border: `2px solid ${selectedIds.has(c.id) ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer', background: '#fff', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                    onMouseEnter={e => { if (!selectedIds.has(c.id)) e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.1)'; }}
                    onMouseLeave={e => { if (!selectedIds.has(c.id)) e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
                        <Avatar name={c.name} size={44} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{c.customer_code}</div>
                      </div>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} onClick={e => e.stopPropagation()} />
                    </div>
                    {(c.email || c.phone) && (
                      <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {c.email && <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={11} color="var(--text3)" />{c.email}</span>}
                        {c.phone && <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={11} color="var(--text3)" />{c.phone}</span>}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Balance</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: c.balance > 0 ? 'var(--brand)' : 'var(--text1)' }}>{fmt(c.balance)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Credit Limit</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)' }}>{fmt(c.credit_limit)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Analytics view ── */}
        {viewMode === 'analytics' && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 16 }}>Balance Distribution</div>
            {filtered.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 14 }}>No data to display.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered.sort((a, b) => (b.balance || 0) - (a.balance || 0)).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Avatar name={c.name} size={30} />
                    <div style={{ width: 160, fontSize: 13, fontWeight: 500, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(((c.balance || 0) / maxBal) * 100, 0)}%`, background: 'linear-gradient(90deg, var(--brand), #a78bfa)', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ width: 120, fontSize: 13, fontWeight: 700, color: c.balance > 0 ? 'var(--brand)' : 'var(--text3)', textAlign: 'right' }}>{fmt(c.balance)}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { label: 'Average Balance', value: fmt(filtered.length ? totalBalance / filtered.length : 0) },
                { label: 'Highest Balance', value: fmt(Math.max(...filtered.map(c => c.balance || 0), 0)) },
                { label: 'With Balance', value: `${filtered.filter(c => c.balance > 0).length} of ${filtered.length}` },
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

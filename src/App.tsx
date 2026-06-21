import { useState, useEffect } from 'react';
import { supabase } from './supabase';

// ── Icon component ──────────────────────────────────────────────
const ICON_PATHS: Record<string, string> = {
  dashboard:        'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  customers:        'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8',
  salesorders:      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12h6 M9 16h4',
  invoices:         'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  receipts:         'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  ecommerce:        'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0',
  suppliers:        'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  purchaseorders:   'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  bills:            'M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  payments:         'M1 4h22v16H1z M1 10h22',
  grn:              'M1 3h15v13H1z M16 8l4 0 3 3v6h-7V8z M5.5 16a1.5 1.5 0 100 3 1.5 1.5 0 000-3z M18.5 16a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  products:         'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  categories:       'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  inventory:        'M18 20V10 M12 20V4 M6 20v-6',
  stockadjustments: 'M12 20h9 M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z',
  coa:              'M22 12h-4l-3 9L9 3l-3 9H2',
  expenses:         'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16',
  journal:          'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  bankreconciliation:'M3 22h18 M6 22V11 M18 22V11 M2 11h20 M12 2L2 7h20z',
  hr:               'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  qc:               'M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3',
  projects:         'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  mrp:              'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  reports:          'M21.21 15.89A10 10 0 118 2.83 M22 12A10 10 0 0012 2v10z',
  analytics:        'M18 20V10 M12 20V4 M6 20v-6',
  manufacturing:    'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  pos:              'M20 3H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2z M8 21h8 M12 17v4',
  userroles:        'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  subscription:     'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  settings:         'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  logout:           'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
};

function NavIcon({ name, size = 15 }: { name: string; size?: number }) {
  return (
    <svg className="nav-item-icon" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[name] || ICON_PATHS.dashboard} />
    </svg>
  );
}
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Invoices from './pages/Invoices';
import Receipts from './pages/Receipts';
import Bills from './pages/Bills';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import GRN from './pages/GRN';
import JournalEntries from './pages/JournalEntries';
import Reports from './pages/Reports';
import Manufacturing from './pages/Manufacturing';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import ChartOfAccounts from './pages/ChartOfAccounts';
import PurchaseOrders from './pages/PurchaseOrders';
import SalesOrders from './pages/SalesOrders';
import Subscription from './pages/Subscription';
import PointOfSale from './pages/PointOfSale';
import StockAdjustments from './pages/StockAdjustments';
import BankReconciliation from './pages/BankReconciliation';
import HR from './pages/HR';
import Analytics from './pages/Analytics';
import UserRoles from './pages/UserRoles';
import QualityControl from './pages/QualityControl';
import Projects from './pages/Projects';
import CustomerPortal from './pages/CustomerPortal';
import ECommerce from './pages/ECommerce';
import PublicStore from './pages/PublicStore';
import MRP from './pages/MRP';
import './App.css';

export type Page =
  | 'dashboard'
  | 'customers'
  | 'suppliers'
  | 'products'
  | 'invoices'
  | 'receipts'
  | 'salesorders'
  | 'purchaseorders'
  | 'bills'
  | 'payments'
  | 'expenses'
  | 'grn'
  | 'inventory'
  | 'journal'
  | 'reports'
  | 'manufacturing'
  | 'settings'
  | 'categories'
  | 'coa'
  | 'subscription'
  | 'pos'
  | 'stockadjustments'
  | 'bankreconciliation'
  | 'hr'
  | 'analytics'
  | 'userroles'
  | 'qc'
  | 'projects'
  | 'ecommerce'
  | 'mrp';

const menuGroups = [
  {
    label: 'Sales',
    items: [
      { page: 'customers', label: 'Customers' },
      { page: 'salesorders', label: 'Sales Orders' },
      { page: 'invoices', label: 'Invoices' },
      { page: 'receipts', label: 'Receipts' },
      { page: 'ecommerce', label: 'E-Commerce' },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { page: 'suppliers', label: 'Suppliers' },
      { page: 'purchaseorders', label: 'Purchase Orders' },
      { page: 'bills', label: 'Vendor Bills' },
      { page: 'payments', label: 'Payments' },
      { page: 'grn', label: 'Goods Received' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { page: 'products', label: 'Products' },
      { page: 'categories', label: 'Categories' },
      { page: 'inventory', label: 'Stock & Movements' },
      { page: 'stockadjustments', label: 'Stock Adjustments' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { page: 'coa', label: 'Chart of Accounts' },
      { page: 'expenses', label: 'Expenses' },
      { page: 'journal', label: 'Journal Entries' },
      { page: 'bankreconciliation', label: 'Bank Reconciliation' },
    ],
  },
  {
    label: 'HR & Payroll',
    items: [{ page: 'hr', label: 'HR & Payroll' }],
  },
  {
    label: 'Operations',
    items: [
      { page: 'qc', label: 'Quality Control' },
      { page: 'projects', label: 'Projects' },
      { page: 'mrp', label: 'MRP' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { page: 'reports', label: 'Financial Reports' },
      { page: 'analytics', label: 'Analytics' },
    ],
  },
  {
    label: 'Manufacturing',
    items: [{ page: 'manufacturing', label: 'BOM & Production' }],
  },
  {
    label: 'Point of Sale',
    items: [{ page: 'pos', label: 'Point of Sale' }],
  },
];

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState<'checking' | 'admin' | 'customer'>('checking');
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moduleMode, setModuleMode] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [grnPrefill, setGrnPrefill] = useState<{ bill: any; lines: any[] } | null>(null);
  const [billPrefill, setBillPrefill] = useState<{ po: any; lines: any[] } | null>(null);
  const [invoicePrefill, setInvoicePrefill] = useState<{ so: any; lines: any[] } | null>(null);

  // URL params — checked after hooks, before auth renders
  const urlParams = new URLSearchParams(window.location.search);
  const storeParam = urlParams.get('store');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setUserType('checking');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setUserType('checking'); return; }
    supabase.from('customer_portal_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setUserType('customer'); return; }
        // check by email (first-time login — link user_id)
        supabase.from('customer_portal_users')
          .select('id')
          .eq('invite_email', user.email)
          .is('user_id', null)
          .eq('is_active', true)
          .maybeSingle()
          .then(({ data: invite }) => {
            if (invite) {
              supabase.from('customer_portal_users').update({ user_id: user.id }).eq('id', invite.id).then();
              setUserType('customer');
            } else {
              setUserType('admin');
            }
          });
      });
  }, [user]);

  if (loading || (user && userType === 'checking'))
    return (
      <div className="splash">
        <img src="/logo.png" alt="LedgerX" style={{ height: 80, objectFit: 'contain', marginBottom: 16 }} />
        <div className="splash-sub">Loading...</div>
      </div>
    );

  if (storeParam) return <PublicStore adminUserId={storeParam} confirmedOrderId={urlParams.get('order')} />;

  if (!user) return <Login />;

  if (userType === 'customer') return <CustomerPortal />;

  const toggleGroup = (label: string) => {
    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  const nav = (p: Page) => {
    setPage(p);
    setModuleMode(p !== 'dashboard');
    const group = menuGroups.find(g => g.items.some(i => i.page === p));
    if (group) setOpenGroups(prev => prev.includes(group.label) ? prev : [...prev, group.label]);
  };

  const exitModule = () => {
    setModuleMode(false);
    setPage('dashboard');
  };

  const currentGroup = menuGroups.find((g) => g.items.some((i) => i.page === page));
  const footerLabels: Record<string, string> = { subscription: 'Subscription & Team', settings: 'Settings', pos: 'Point of Sale', userroles: 'Users & Roles', ecommerce: 'E-Commerce' };
  const currentLabel = currentGroup?.items.find((i) => i.page === page)?.label || footerLabels[page] || 'Dashboard';
  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard nav={nav} />;
      case 'customers':
        return <Customers onBack={exitModule} />;
      case 'suppliers':
        return <Suppliers />;
      case 'products':
        return <Products />;
      case 'inventory':
        return <Inventory />;
      case 'salesorders':
        return (
          <SalesOrders
            nav={nav}
            onCreateInvoice={(so, lines) => {
              setInvoicePrefill({ so, lines });
              setPage('invoices');
            }}
          />
        );
      case 'invoices':
        return (
          <Invoices
            prefillFromSO={invoicePrefill}
            onConsumeSoPrefill={() => setInvoicePrefill(null)}
          />
        );
      case 'receipts':
        return <Receipts />;
      case 'purchaseorders':
        return (
          <PurchaseOrders
            nav={nav}
            onReceiveProducts={(po, lines) => {
              setGrnPrefill({
                bill: { id: null, bill_number: po.po_number, supplier_id: po.supplier_id, supplier_name: po.supplier_name },
                lines: lines.map((l: any) => ({ product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost, line_total: l.line_total })),
              });
              setPage('grn');
            }}
            onCreateBill={(po, lines) => {
              setBillPrefill({ po, lines });
              setPage('bills');
            }}
          />
        );
      case 'bills':
        return (
          <Bills
            onCreateGrn={(bill, lines) => {
              setGrnPrefill({ bill, lines });
              setPage('grn');
            }}
            prefillFromPO={billPrefill}
            onConsumePOPrefill={() => setBillPrefill(null)}
          />
        );
      case 'payments':
        return <Payments />;
      case 'expenses':
        return <Expenses />;
      case 'grn':
        return (
          <GRN
            nav={nav}
            prefill={grnPrefill}
            onConsumePrefill={() => setGrnPrefill(null)}
          />
        );
      case 'journal':
        return <JournalEntries />;
      case 'reports':
        return <Reports />;
      case 'manufacturing':
        return <Manufacturing />;
      case 'categories':
        return <Categories />;
      case 'settings':
        return <Settings />;
      case 'coa':
        return <ChartOfAccounts />;
      case 'pos':
        return <PointOfSale nav={nav} />;
      case 'stockadjustments':
        return <StockAdjustments />;
      case 'bankreconciliation':
        return <BankReconciliation />;
      case 'hr':
        return <HR />;
      case 'analytics':
        return <Analytics />;
      case 'userroles':
        return <UserRoles />;
      case 'qc':
        return <QualityControl />;
      case 'projects':
        return <Projects />;
      case 'ecommerce':
        return <ECommerce />;
      case 'mrp':
        return <MRP />;
      case 'subscription':
        return <Subscription />;
      default:
        return <Dashboard nav={nav} />;
    }
  };

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'} ${moduleMode ? 'module-hidden' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <img src="/logo.png" alt="LedgerX" style={{ height: sidebarOpen ? 52 : 30, width: sidebarOpen ? 'auto' : 30, objectFit: 'contain', objectPosition: 'center top', flexShrink: 0, transition: 'height 0.35s' }} />
        </div>

        <nav className="sidebar-nav">
          {/* Dashboard */}
          <button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => nav('dashboard')}>
            <NavIcon name="dashboard" />
            {sidebarOpen && <span className="nav-item-label">Dashboard</span>}
          </button>

          {/* Module groups — accordion */}
          {menuGroups.map((group) => {
            const isOpen = openGroups.includes(group.label);
            const hasActive = group.items.some(i => i.page === page);
            return (
              <div key={group.label}>
                {sidebarOpen ? (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '16px 12px 6px', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: hasActive ? 'var(--brand)' : '#9ca3af',
                    }}>
                      {group.label}
                    </span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      style={{ color: hasActive ? 'var(--brand)' : 'var(--text3)', flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                ) : (
                  <div style={{ height: 1, background: 'var(--border)', margin: '6px 8px' }} />
                )}
                {(isOpen || !sidebarOpen) && group.items.map((item) => (
                  <button
                    key={item.page}
                    className={`nav-item ${page === item.page ? 'active' : ''}`}
                    onClick={() => nav(item.page as Page)}
                    title={!sidebarOpen ? item.label : undefined}
                    style={{ fontSize: '13px' }}
                  >
                    <NavIcon name={item.page} size={14} />
                    {sidebarOpen && <span className="nav-item-label" style={{ fontSize: '13px' }}>{item.label}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {sidebarOpen && <div className="nav-section-label">Account</div>}
          <button className={`nav-item ${page === 'userroles' ? 'active' : ''}`} onClick={() => nav('userroles')} title={!sidebarOpen ? 'Users & Roles' : undefined}>
            <NavIcon name="userroles" />
            {sidebarOpen && <span className="nav-item-label">Users & Roles</span>}
          </button>
          <button className={`nav-item ${page === 'subscription' ? 'active' : ''}`} onClick={() => nav('subscription')} title={!sidebarOpen ? 'Subscription' : undefined}>
            <NavIcon name="subscription" />
            {sidebarOpen && <span className="nav-item-label">Subscription</span>}
          </button>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => nav('settings')} title={!sidebarOpen ? 'Settings' : undefined}>
            <NavIcon name="settings" />
            {sidebarOpen && <span className="nav-item-label">Settings</span>}
          </button>
          <button className="nav-item signout" onClick={() => supabase.auth.signOut()} title={!sidebarOpen ? 'Sign Out' : undefined}>
            <NavIcon name="logout" />
            {sidebarOpen && <span className="nav-item-label">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          {moduleMode ? (
            /* Back to Dashboard button */
            <button className="toggle-btn" onClick={exitModule} title="Back to Dashboard" style={{ width: 'auto', padding: '0 10px', gap: 6, display: 'flex', alignItems: 'center', color: 'var(--text2)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
            </button>
          ) : (
            /* Hamburger */
            <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}

          {/* Breadcrumb */}
          {moduleMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <span style={{ color: 'var(--text3)', cursor: 'pointer' }} onClick={exitModule}>Dashboard</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="topbar-title">{currentLabel}</span>
            </div>
          ) : (
            <span className="topbar-title">Dashboard</span>
          )}

          {/* Search */}
          <div className="topbar-search">
            <svg className="topbar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input placeholder="Search..." />
          </div>

          {/* Right side */}
          <div className="topbar-right">
            <button className="topbar-icon-btn" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              <span className="notif-badge">3</span>
            </button>

            <div className="topbar-user">
              <div className="user-avatar">{user.email?.charAt(0).toUpperCase()}</div>
              <div className="user-info">
                <span className="user-name">{displayName}</span>
                <span className="user-email">{user.email}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--text3)', marginLeft: 2 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        </header>
        <div className="page-content">{renderPage()}</div>
      </main>
    </div>
  );
}
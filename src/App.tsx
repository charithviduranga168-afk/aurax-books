import { useState, useEffect } from 'react';
import { supabase } from './supabase';
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
  | 'pos';

const menuGroups = [
  {
    label: 'Sales',
    items: [
      { page: 'customers', label: 'Customers' },
      { page: 'salesorders', label: 'Sales Orders' },
      { page: 'invoices', label: 'Invoices' },
      { page: 'receipts', label: 'Receipts' },
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
    ],
  },
  {
    label: 'Accounting',
    items: [
      { page: 'coa', label: 'Chart of Accounts' },
      { page: 'expenses', label: 'Expenses' },
      { page: 'journal', label: 'Journal Entries' },
    ],
  },
  {
    label: 'Reports',
    items: [{ page: 'reports', label: 'Financial Reports' }],
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
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>(
    menuGroups.map((g) => g.label)
  );
  const [grnPrefill, setGrnPrefill] = useState<{ bill: any; lines: any[] } | null>(null);
  const [billPrefill, setBillPrefill] = useState<{ po: any; lines: any[] } | null>(null);
  const [invoicePrefill, setInvoicePrefill] = useState<{ so: any; lines: any[] } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading)
    return (
      <div className="splash">
        <div className="splash-logo">📒</div>
        <div className="splash-title">AURAX BOOKS</div>
        <div className="splash-sub">Loading...</div>
      </div>
    );

  if (!user) return <Login />;

  const nav = (p: Page) => setPage(p);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const currentGroup = menuGroups.find((g) =>
    g.items.some((i) => i.page === page)
  );
  const footerLabels: Record<string, string> = { subscription: 'Subscription & Team', settings: 'Settings', pos: 'Point of Sale' };
  const currentLabel =
    currentGroup?.items.find((i) => i.page === page)?.label || footerLabels[page] || 'Dashboard';

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard nav={nav} />;
      case 'customers':
        return <Customers />;
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
        return <PointOfSale />;
      case 'subscription':
        return <Subscription />;
      default:
        return <Dashboard nav={nav} />;
    }
  };

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          {sidebarOpen ? (
            <span className="brand-name">AURAX BOOKS</span>
          ) : (
            <span className="brand-name-short">AB</span>
          )}
        </div>

        <nav className="sidebar-nav">
          {/* Dashboard */}
          <button
            className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
            onClick={() => nav('dashboard')}
          >
            {sidebarOpen ? 'Dashboard' : 'DB'}
          </button>

          {/* Module groups */}
          {menuGroups.map((group) => {
            const isOpen = openGroups.includes(group.label);
            const hasActive = group.items.some((i) => i.page === page);

            return (
              <div key={group.label} className="nav-module">
                <button
                  className={`nav-module-header ${hasActive ? 'has-active' : ''}`}
                  onClick={() => sidebarOpen && toggleGroup(group.label)}
                >
                  <span className="nav-module-label">
                    {sidebarOpen ? group.label : group.label.slice(0, 2)}
                  </span>
                  {sidebarOpen && (
                    <span className="nav-chevron">{isOpen ? '▾' : '▸'}</span>
                  )}
                </button>

                {isOpen && sidebarOpen && (
                  <div className="nav-module-items">
                    {group.items.map((item) => (
                      <button
                        key={item.page}
                        className={`nav-sub-item ${page === item.page ? 'active' : ''}`}
                        onClick={() => nav(item.page as Page)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className={`nav-item ${page === 'subscription' ? 'active' : ''}`} onClick={() => nav('subscription')}>
            {sidebarOpen ? 'Subscription' : 'Su'}
          </button>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => nav('settings')}>
            {sidebarOpen ? 'Settings' : 'St'}
          </button>
          <button
            className="nav-item signout"
            onClick={() => supabase.auth.signOut()}
          >
            {sidebarOpen ? 'Sign Out' : '→'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          <button
            className="toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? '‹' : '›'}
          </button>
          <div className="topbar-breadcrumb">
            {currentGroup && (
              <span className="breadcrumb-parent">{currentGroup.label} / </span>
            )}
            <span className="topbar-title">
              {page === 'dashboard' ? 'Dashboard' : currentLabel}
            </span>
          </div>
          <div className="topbar-user">
            <span className="user-avatar">
              {user.email?.charAt(0).toUpperCase()}
            </span>
            <span className="user-email">{user.email}</span>
          </div>
        </header>
        <div className="page-content">{renderPage()}</div>
      </main>
    </div>
  );
}
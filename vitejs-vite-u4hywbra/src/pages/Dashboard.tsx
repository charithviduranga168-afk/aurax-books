import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import type { Page } from '../App';

interface Props {
  nav: (p: Page) => void;
}

export default function Dashboard({ nav }: Props) {
  const [kpis, setKpis] = useState({
    sales: 0,
    expenses: 0,
    receivables: 0,
    payables: 0,
    cash: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const firstOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      )
        .toISOString()
        .split('T')[0];

      const [inv, exp, bil, rec, pay] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            'total,paid_amount,balance,status,date,invoice_number,customer_name'
          )
          .eq('user_id', user.id),
        supabase.from('expenses').select('amount,date').eq('user_id', user.id),
        supabase.from('bills').select('balance').eq('user_id', user.id),
        supabase.from('receipts').select('amount').eq('user_id', user.id),
        supabase.from('payments').select('amount').eq('user_id', user.id),
      ]);

      const invoices = inv.data || [];
      const expenses = exp.data || [];

      const monthlySales = invoices
        .filter((i: any) => i.date >= firstOfMonth)
        .reduce((s: number, i: any) => s + (i.total || 0), 0);
      const monthlyExp = expenses
        .filter((e: any) => e.date >= firstOfMonth)
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const totalRec = invoices.reduce(
        (s: number, i: any) => s + (i.balance || 0),
        0
      );
      const totalPay = (bil.data || []).reduce(
        (s: number, b: any) => s + (b.balance || 0),
        0
      );
      const cashIn = (rec.data || []).reduce(
        (s: number, r: any) => s + (r.amount || 0),
        0
      );
      const cashOut = (pay.data || []).reduce(
        (s: number, p: any) => s + (p.amount || 0),
        0
      );
      const cashExp = expenses.reduce(
        (s: number, e: any) => s + (e.amount || 0),
        0
      );

      setKpis({
        sales: monthlySales,
        expenses: monthlyExp,
        receivables: totalRec,
        payables: totalPay,
        cash: cashIn - cashOut - cashExp,
      });
      setRecentInvoices(
        invoices
          .sort((a: any, b: any) => (b.date > a.date ? 1 : -1))
          .slice(0, 6)
      );
    } catch (e) {
      console.log('Dashboard error:', e);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) =>
    'Rs. ' +
    Math.abs(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  const kpiCards = [
    {
      label: 'Sales This Month',
      value: fmt(kpis.sales),
      color: '#12b76a',
      bg: '#ecfdf3',
      page: 'invoices' as Page,
    },
    {
      label: 'Expenses This Month',
      value: fmt(kpis.expenses),
      color: '#f04438',
      bg: '#fef3f2',
      page: 'expenses' as Page,
    },
    {
      label: 'Receivables',
      value: fmt(kpis.receivables),
      color: '#2e90fa',
      bg: '#eff8ff',
      page: 'invoices' as Page,
    },
    {
      label: 'Payables',
      value: fmt(kpis.payables),
      color: '#f79009',
      bg: '#fffaeb',
      page: 'bills' as Page,
    },
    {
      label: 'Cash Balance (Est.)',
      value: fmt(kpis.cash),
      color: '#4f35c8',
      bg: '#ede9ff',
      page: 'reports' as Page,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">
            {new Date().toLocaleDateString('en-LK', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => nav('invoices')}>
          + New Invoice
        </button>
      </div>

      {loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--text2)',
            padding: '40px 0',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--brand)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          Loading dashboard...
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            {kpiCards.map((k) => (
              <div
                key={k.label}
                className="kpi-card"
                style={{ '--kpi-color': k.color } as any}
                onClick={() => nav(k.page)}
              >
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="table-wrap">
            <div className="table-toolbar">
              <h3>Recent Invoices</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => nav('invoices')}
              >
                View All →
              </button>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧾</div>
                <h3>No invoices yet</h3>
                <p>Create your first invoice to get started</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => nav('invoices')}
                >
                  + Create Invoice
                </button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv, i) => (
                    <tr
                      key={i}
                      style={{ cursor: 'pointer' }}
                      onClick={() => nav('invoices')}
                    >
                      <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                        {inv.invoice_number}
                      </td>
                      <td style={{ color: 'var(--text2)' }}>{inv.date}</td>
                      <td>{inv.customer_name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(inv.total)}
                      </td>
                      <td
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          color: 'var(--green)',
                        }}
                      >
                        {fmt(inv.paid_amount)}
                      </td>
                      <td
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                        }}
                      >
                        {fmt(inv.balance)}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            inv.status === 'Paid'
                              ? 'badge-green'
                              : inv.status === 'Partial'
                              ? 'badge-yellow'
                              : 'badge-red'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

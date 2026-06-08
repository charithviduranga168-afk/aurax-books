import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Sector,
} from 'recharts';

interface MonthData { month: string; revenue: number; expenses: number; profit: number; }
interface CashData  { month: string; in: number; out: number; }
interface InvoiceStatus { name: string; value: number; color: string; }
interface TopProduct { name: string; amount: number; }

const COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getMonthKey(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function getLast6Months() {
  const result: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
  }
  return result;
}

const fmtCur = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 0 });
const fmtAxis = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(0) + 'k' : String(n);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>{p.name}: {fmtCur(p.value)}</div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [monthData, setMonthData] = useState<MonthData[]>([]);
  const [cashData,  setCashData]  = useState<CashData[]>([]);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Summary KPIs
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [totalCashIn, setTotalCashIn] = useState(0);

  // Active PieChart index
  const [activePieIdx, setActivePieIdx] = useState(0);

  // Date range filter
  const [range, setRange] = useState<'3m' | '6m' | '12m'>('6m');

  useEffect(() => { loadAnalytics(); }, [range]);

  async function loadAnalytics() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const months = range === '3m' ? 3 : range === '12m' ? 12 : 6;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const [invRes, recRes, payRes, expRes] = await Promise.all([
      supabase.from('invoices').select('date,total,status,customer_name').eq('user_id', user.id),
      supabase.from('receipts').select('date,amount').eq('user_id', user.id).gte('date', cutoffStr),
      supabase.from('payments').select('date,amount').eq('user_id', user.id).gte('date', cutoffStr),
      supabase.from('expenses').select('date,amount,category').eq('user_id', user.id).gte('date', cutoffStr),
    ]);

    const invoices = invRes.data || [];
    const receipts = recRes.data || [];
    const payments = payRes.data || [];
    const expenses = expRes.data || [];

    // Invoice status breakdown
    const statusMap: Record<string, number> = {};
    for (const inv of invoices) statusMap[inv.status] = (statusMap[inv.status] || 0) + 1;
    const statusColors: Record<string, string> = { Paid: '#16a34a', Draft: '#9ca3af', Sent: '#2563eb', Overdue: '#dc2626', 'Partially Paid': '#d97706' };
    setInvoiceStatus(Object.entries(statusMap).map(([name, value]) => ({ name, value, color: statusColors[name] || '#7c3aed' })));

    // KPIs
    const recentInvoices = invoices.filter(i => i.date >= cutoffStr);
    const rev = recentInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.total || 0), 0);
    const outstanding = invoices.filter(i => ['Sent', 'Overdue', 'Partially Paid'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0);
    const exp = expenses.reduce((s, e) => s + (e.amount || 0), 0) + payments.reduce((s, p) => s + (p.amount || 0), 0);
    const cashIn = receipts.reduce((s, r) => s + (r.amount || 0), 0);
    setTotalRevenue(rev); setTotalExpenses(exp); setTotalOutstanding(outstanding); setTotalCashIn(cashIn);

    // Monthly revenue vs expenses
    const labels = getLast6Months().slice(-(months));
    const revByMonth: Record<string, number> = {};
    const expByMonth: Record<string, number> = {};
    for (const inv of recentInvoices.filter(i => i.status === 'Paid')) {
      const k = getMonthKey(inv.date); if (labels.includes(k)) revByMonth[k] = (revByMonth[k] || 0) + (inv.total || 0);
    }
    for (const e of expenses) {
      const k = getMonthKey(e.date); if (labels.includes(k)) expByMonth[k] = (expByMonth[k] || 0) + (e.amount || 0);
    }
    for (const p of payments) {
      const k = getMonthKey(p.date); if (labels.includes(k)) expByMonth[k] = (expByMonth[k] || 0) + (p.amount || 0);
    }
    setMonthData(labels.map(m => ({ month: m, revenue: revByMonth[m] || 0, expenses: expByMonth[m] || 0, profit: (revByMonth[m] || 0) - (expByMonth[m] || 0) })));

    // Cash flow
    const cashInByMonth: Record<string, number> = {};
    const cashOutByMonth: Record<string, number> = {};
    for (const r of receipts) { const k = getMonthKey(r.date); if (labels.includes(k)) cashInByMonth[k] = (cashInByMonth[k] || 0) + (r.amount || 0); }
    for (const p of payments) { const k = getMonthKey(p.date); if (labels.includes(k)) cashOutByMonth[k] = (cashOutByMonth[k] || 0) + (p.amount || 0); }
    for (const e of expenses) { const k = getMonthKey(e.date); if (labels.includes(k)) cashOutByMonth[k] = (cashOutByMonth[k] || 0) + (e.amount || 0); }
    setCashData(labels.map(m => ({ month: m, in: cashInByMonth[m] || 0, out: cashOutByMonth[m] || 0 })));

    // Top customers by invoice total (paid)
    const custMap: Record<string, number> = {};
    for (const inv of recentInvoices.filter(i => i.status === 'Paid' && i.customer_name)) {
      custMap[inv.customer_name] = (custMap[inv.customer_name] || 0) + (inv.total || 0);
    }
    setTopCustomers(Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, amount]) => ({ name, amount })));

    setLoading(false);
  }

  const netProfit = totalRevenue - totalExpenses;
  const profitColor = netProfit >= 0 ? '#16a34a' : '#dc2626';

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;
    return (
      <g>
        <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text1)" fontSize={13} fontWeight={700}>{payload.name}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text3)" fontSize={12}>{value} invoices</text>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      </g>
    );
  };

  if (loading) return <div className="empty-state"><p>Loading analytics...</p></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-sub">Revenue, expenses, cash flow and trends</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['3m', '6m', '12m'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{ padding: '6px 16px', borderRadius: 20, border: '1.5px solid', fontSize: 12, fontWeight: range === r ? 700 : 500, cursor: 'pointer', background: range === r ? 'var(--brand)' : 'transparent', color: range === r ? '#fff' : 'var(--text2)', borderColor: range === r ? 'var(--brand)' : 'var(--border)' }}>
              {r === '3m' ? '3 Months' : r === '6m' ? '6 Months' : '12 Months'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Revenue', value: fmtCur(totalRevenue), sub: 'Paid invoices', color: '#7c3aed', icon: '📈' },
          { label: 'Total Expenses', value: fmtCur(totalExpenses), sub: 'Payments + expenses', color: '#dc2626', icon: '📉' },
          { label: 'Net Profit', value: fmtCur(netProfit), sub: netProfit >= 0 ? 'Surplus' : 'Deficit', color: profitColor, icon: netProfit >= 0 ? '✅' : '⚠️' },
          { label: 'Outstanding', value: fmtCur(totalOutstanding), sub: 'Unpaid invoices', color: '#d97706', icon: '⏳' },
        ].map(k => (
          <div key={k.label} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 1: Revenue vs Expenses bar chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>Revenue vs Expenses</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
            <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: 'var(--text3)' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" name="Revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Row 2: Cash Flow line + Invoice Status pie */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>Cash Flow</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cashData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: 'var(--text3)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="in" name="Cash In" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="out" name="Cash Out" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Invoice Status</div>
          {invoiceStatus.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)', fontSize: 13 }}>No invoices found</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={invoiceStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    dataKey="value" activeIndex={activePieIdx}
                    activeShape={renderActiveShape}
                    onMouseEnter={(_, i) => setActivePieIdx(i)}>
                    {invoiceStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', marginTop: 4 }}>
                {invoiceStatus.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text2)' }}>{s.name} ({s.value})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Profit trend + Top Customers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>Monthly Profit / Loss</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: 'var(--text3)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="profit" name="Net Profit" radius={[4, 4, 0, 0]}>
                {monthData.map((entry, i) => <Cell key={i} fill={entry.profit >= 0 ? '#16a34a' : '#dc2626'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Top Customers by Revenue</div>
          {topCustomers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 13 }}>No paid invoice data</div>
          ) : (
            <div>
              {topCustomers.map((c, i) => {
                const maxAmt = topCustomers[0].amount;
                const pct = maxAmt ? (c.amount / maxAmt) * 100 : 0;
                return (
                  <div key={c.name} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 20, height: 20, borderRadius: 4, background: COLORS[i % COLORS.length], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmtCur(c.amount)}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: COLORS[i % COLORS.length], borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

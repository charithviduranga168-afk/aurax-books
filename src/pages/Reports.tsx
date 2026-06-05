import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Reports() {
  const [activeReport, setActiveReport] = useState('pnl')
  const [loading, setLoading] = useState(false)
  const [company, setCompany] = useState<any>({})
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [reportData, setReportData] = useState<any>(null)

  useEffect(() => { loadCompany() }, [])

  async function loadCompany() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle()
    setCompany(data || {})
  }

  async function runReport() {
    setLoading(true)
    setReportData(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (activeReport === 'pnl') await loadPnL(user.id)
    else if (activeReport === 'cashflow') await loadCashFlow(user.id)
    else if (activeReport === 'aged_rec') await loadAgedReceivables(user.id)
    else if (activeReport === 'aged_pay') await loadAgedPayables(user.id)
    else if (activeReport === 'balance') await loadBalanceSheet(user.id)

    setLoading(false)
  }

  async function loadPnL(userId: string) {
    const [invRes, expRes, billRes] = await Promise.all([
      supabase.from('invoices').select('total,subtotal,date,customer_name').eq('user_id', userId).gte('date', fromDate).lte('date', toDate),
      supabase.from('expenses').select('amount,category,date').eq('user_id', userId).gte('date', fromDate).lte('date', toDate),
      supabase.from('invoice_lines').select('cogs,invoice_id'),
    ])

    const invoices = invRes.data || []
    const expenses = expRes.data || []

    const revenue = invoices.reduce((s: number, i: any) => s + (i.subtotal || i.total || 0), 0)

    // Get COGS for invoices in date range
    const invIds = invoices.map((i: any) => i.id).filter(Boolean)
    const allLines = billRes.data || []
    const cogs = allLines.filter((l: any) => invIds.includes(l.invoice_id)).reduce((s: number, l: any) => s + (l.cogs || 0), 0)

    const grossProfit = revenue - cogs

    // Expenses by category
    const expByCategory: any = {}
    expenses.forEach((e: any) => {
      expByCategory[e.category] = (expByCategory[e.category] || 0) + (e.amount || 0)
    })
    const totalExpenses = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0)
    const netProfit = grossProfit - totalExpenses

    setReportData({ type: 'pnl', revenue, cogs, grossProfit, expByCategory, totalExpenses, netProfit })
  }

  async function loadCashFlow(userId: string) {
    const [recRes, payRes, expRes] = await Promise.all([
      supabase.from('receipts').select('amount,date').eq('user_id', userId).gte('date', fromDate).lte('date', toDate),
      supabase.from('payments').select('amount,date').eq('user_id', userId).gte('date', fromDate).lte('date', toDate),
      supabase.from('expenses').select('amount,date,category').eq('user_id', userId).gte('date', fromDate).lte('date', toDate),
    ])

    const receipts = recRes.data || []
    const payments = payRes.data || []
    const expenses = expRes.data || []

    const cashIn = receipts.reduce((s: number, r: any) => s + (r.amount || 0), 0)
    const cashOutSuppliers = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    const cashOutExpenses = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0)
    const netCash = cashIn - cashOutSuppliers - cashOutExpenses

    setReportData({ type: 'cashflow', cashIn, cashOutSuppliers, cashOutExpenses, netCash, receipts: receipts.length, payments: payments.length })
  }

  async function loadAgedReceivables(userId: string) {
    const { data } = await supabase.from('invoices').select('*').eq('user_id', userId).neq('status', 'Paid').gt('balance', 0)
    const today = new Date()
    const aged = (data || []).map((inv: any) => {
      const due = new Date(inv.due_date)
      const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
      return { ...inv, daysOverdue: days }
    })
    setReportData({ type: 'aged_rec', items: aged })
  }

  async function loadAgedPayables(userId: string) {
    const { data } = await supabase.from('bills').select('*').eq('user_id', userId).neq('status', 'Paid').gt('balance', 0)
    const today = new Date()
    const aged = (data || []).map((bill: any) => {
      const due = new Date(bill.due_date)
      const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
      return { ...bill, daysOverdue: days }
    })
    setReportData({ type: 'aged_pay', items: aged })
  }

  async function loadBalanceSheet(userId: string) {
    const [custRes, suppRes, invRes, billRes, expRes, recRes, payRes] = await Promise.all([
      supabase.from('customers').select('balance').eq('user_id', userId),
      supabase.from('suppliers').select('balance').eq('user_id', userId),
      supabase.from('invoices').select('balance,total').eq('user_id', userId),
      supabase.from('bills').select('balance,total').eq('user_id', userId),
      supabase.from('expenses').select('amount').eq('user_id', userId),
      supabase.from('receipts').select('amount').eq('user_id', userId),
      supabase.from('payments').select('amount').eq('user_id', userId),
    ])

    const totalReceivables = (invRes.data || []).reduce((s: number, i: any) => s + (i.balance || 0), 0)
    const totalPayables = (billRes.data || []).reduce((s: number, b: any) => s + (b.balance || 0), 0)
    const totalReceipts = (recRes.data || []).reduce((s: number, r: any) => s + (r.amount || 0), 0)
    const totalPayments = (payRes.data || []).reduce((s: number, p: any) => s + (p.amount || 0), 0)
    const totalExpenses = (expRes.data || []).reduce((s: number, e: any) => s + (e.amount || 0), 0)
    const cashBalance = totalReceipts - totalPayments - totalExpenses
    const totalRevenue = (invRes.data || []).reduce((s: number, i: any) => s + (i.total || 0), 0)
    const totalCosts = (billRes.data || []).reduce((s: number, b: any) => s + (b.total || 0), 0)
    const retainedEarnings = totalRevenue - totalCosts - totalExpenses

    setReportData({ type: 'balance', totalReceivables, totalPayables, cashBalance, retainedEarnings, totalRevenue, totalExpenses })
  }

  const fmt = (n: number) => 'Rs. ' + Math.abs(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })

  function exportPDF() {
    if (!reportData) return
    const doc = new jsPDF()
    const f = (n: number) => (Math.abs(n || 0)).toLocaleString('en-LK', { minimumFractionDigits: 2 })

    // Header
    doc.setFillColor(248, 249, 252)
    doc.rect(0, 0, 210, 42, 'F')
    doc.setFillColor(79, 53, 200)
    doc.rect(0, 0, 4, 42, 'F')
    doc.setTextColor(79, 53, 200)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(company.company_name || 'Company Name', 12, 14)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    const titles: any = { pnl: 'PROFIT & LOSS STATEMENT', cashflow: 'CASH FLOW STATEMENT', aged_rec: 'AGED RECEIVABLES REPORT', aged_pay: 'AGED PAYABLES REPORT', balance: 'BALANCE SHEET' }
    doc.text(titles[reportData.type] || 'REPORT', 12, 21)
    let cy = 27
    if (company.address) { doc.text(company.address, 12, cy); cy += 5 }
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(9)
    doc.text('Period: ' + fromDate + ' to ' + toDate, 198, 22, { align: 'right' })
    doc.text('Generated: ' + new Date().toLocaleDateString('en-LK'), 198, 28, { align: 'right' })
    doc.setDrawColor(79, 53, 200)
    doc.setLineWidth(0.5)
    doc.line(0, 42, 210, 42)

    if (reportData.type === 'pnl') {
      autoTable(doc, {
        startY: 50,
        head: [['Description', 'Amount (Rs.)']],
        body: [
          ['REVENUE', ''],
          ['Sales Revenue', f(reportData.revenue)],
          ['', ''],
          ['COST OF SALES', ''],
          ['Cost of Goods Sold', f(reportData.cogs)],
          ['', ''],
          ['GROSS PROFIT', f(reportData.grossProfit)],
          ['', ''],
          ['OPERATING EXPENSES', ''],
          ...Object.entries(reportData.expByCategory).map(([k, v]: any) => [k, f(v)]),
          ['Total Expenses', f(reportData.totalExpenses)],
          ['', ''],
          ['NET PROFIT / (LOSS)', f(reportData.netProfit)],
        ],
        headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: (data) => {
          if (['REVENUE', 'COST OF SALES', 'OPERATING EXPENSES', 'GROSS PROFIT', 'NET PROFIT / (LOSS)'].includes(data.cell.raw as string)) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fillColor = [240, 240, 248]
          }
        },
        margin: { left: 12, right: 12 }
      })
    } else if (reportData.type === 'cashflow') {
      autoTable(doc, {
        startY: 50,
        head: [['Description', 'Amount (Rs.)']],
        body: [
          ['CASH INFLOWS', ''],
          ['Receipts from Customers', f(reportData.cashIn)],
          ['', ''],
          ['CASH OUTFLOWS', ''],
          ['Payments to Suppliers', '(' + f(reportData.cashOutSuppliers) + ')'],
          ['Expense Payments', '(' + f(reportData.cashOutExpenses) + ')'],
          ['Total Outflows', '(' + f(reportData.cashOutSuppliers + reportData.cashOutExpenses) + ')'],
          ['', ''],
          ['NET CASH FLOW', f(reportData.netCash)],
        ],
        headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 12, right: 12 }
      })
    } else if (reportData.type === 'aged_rec' || reportData.type === 'aged_pay') {
      const isRec = reportData.type === 'aged_rec'
      autoTable(doc, {
        startY: 50,
        head: [[(isRec ? 'Customer' : 'Supplier'), 'Doc #', 'Date', 'Due Date', 'Balance', 'Days Overdue', 'Status']],
        body: reportData.items.map((i: any) => [
          isRec ? i.customer_name : i.supplier_name,
          isRec ? i.invoice_number : i.bill_number,
          i.date, i.due_date,
          'Rs. ' + f(i.balance),
          i.daysOverdue > 0 ? i.daysOverdue + ' days' : 'Current',
          i.daysOverdue <= 0 ? 'Current' : i.daysOverdue <= 30 ? '1-30 days' : i.daysOverdue <= 60 ? '31-60 days' : i.daysOverdue <= 90 ? '61-90 days' : '90+ days'
        ]),
        headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 12, right: 12 }
      })
    } else if (reportData.type === 'balance') {
      autoTable(doc, {
        startY: 50,
        head: [['Description', 'Amount (Rs.)']],
        body: [
          ['ASSETS', ''],
          ['Cash Balance (Est.)', f(reportData.cashBalance)],
          ['Accounts Receivable', f(reportData.totalReceivables)],
          ['Total Assets', f(Math.max(0, reportData.cashBalance) + reportData.totalReceivables)],
          ['', ''],
          ['LIABILITIES', ''],
          ['Accounts Payable', f(reportData.totalPayables)],
          ['Total Liabilities', f(reportData.totalPayables)],
          ['', ''],
          ['EQUITY', ''],
          ['Retained Earnings', f(reportData.retainedEarnings)],
          ['Total Equity', f(reportData.retainedEarnings)],
        ],
        headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: (data) => {
          if (['ASSETS', 'LIABILITIES', 'EQUITY'].includes(data.cell.raw as string)) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fillColor = [240, 240, 248]
          }
        },
        margin: { left: 12, right: 12 }
      })
    }

    const pageH = doc.internal.pageSize.height
    doc.setFillColor(248, 249, 252)
    doc.rect(0, pageH - 14, 210, 14, 'F')
    doc.setFillColor(79, 53, 200)
    doc.rect(0, pageH - 14, 4, 14, 'F')
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(8)
    doc.text(company.company_name || '', 14, pageH - 6)
    doc.text('Confidential — Aurax Books', 105, pageH - 6, { align: 'center' })

    const filename = titles[reportData.type]?.replace(/ /g, '_') || 'Report'
    doc.save(filename + '_' + fromDate + '.pdf')
  }

  const reportTabs = [
    { id: 'pnl', label: 'P&L' },
    { id: 'balance', label: 'Balance Sheet' },
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'aged_rec', label: 'Aged Receivables' },
    { id: 'aged_pay', label: 'Aged Payables' },
  ]

  const needsDates = ['pnl', 'cashflow'].includes(activeReport)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Financial Reports</div>
          <div className="page-sub">Generate and export your financial reports</div>
        </div>
        {reportData && (
          <button className="btn btn-primary" onClick={exportPDF}>⬇ Export PDF</button>
        )}
      </div>

      {/* Report tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {reportTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveReport(tab.id); setReportData(null) }}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              background: activeReport === tab.id ? 'var(--brand)' : 'var(--bg2)',
              color: activeReport === tab.id ? '#fff' : 'var(--text2)',
              border: activeReport === tab.id ? 'none' : '1px solid var(--border)',
              transition: 'all 0.15s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {needsDates && (
            <>
              <div className="form-group">
                <label>From Date</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: '160px' }} />
              </div>
              <div className="form-group">
                <label>To Date</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: '160px' }} />
              </div>
            </>
          )}
          {!needsDates && (
            <div style={{ color: 'var(--text2)', fontSize: '13px' }}>
              {activeReport === 'balance' ? 'As at today' : 'All outstanding items'}
            </div>
          )}
          <button className="btn btn-primary" onClick={runReport} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          {reportData && (
            <button className="btn btn-secondary" onClick={exportPDF}>⬇ PDF</button>
          )}
        </div>
      </div>

      {/* Report output */}
      {loading && <div className="empty-state"><p>Generating report...</p></div>}

      {reportData && reportData.type === 'pnl' && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Profit & Loss — {fromDate} to {toDate}</h3>
          </div>
          <table>
            <tbody>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>REVENUE</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Sales Revenue</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.revenue)}</td>
              </tr>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>COST OF SALES</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Cost of Goods Sold</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.cogs)}</td>
              </tr>
              <tr style={{ background: 'var(--brand-light)', borderTop: '2px solid var(--border)' }}>
                <td style={{ fontWeight: 700, padding: '12px 16px', color: 'var(--brand)' }}>GROSS PROFIT</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--brand)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.grossProfit)}</td>
              </tr>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>OPERATING EXPENSES</td>
                <td></td>
              </tr>
              {Object.entries(reportData.expByCategory).map(([cat, amt]: any) => (
                <tr key={cat}>
                  <td style={{ padding: '8px 16px 8px 32px', color: 'var(--text2)' }}>{cat}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(amt)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ fontWeight: 600, padding: '10px 16px 10px 32px' }}>Total Expenses</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.totalExpenses)}</td>
              </tr>
              <tr style={{ background: reportData.netProfit >= 0 ? '#ecfdf3' : '#fef3f2', borderTop: '2px solid var(--border)' }}>
                <td style={{ fontWeight: 700, padding: '14px 16px', fontSize: '15px', color: reportData.netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {reportData.netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, fontSize: '15px', color: reportData.netProfit >= 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(reportData.netProfit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {reportData && reportData.type === 'cashflow' && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Cash Flow — {fromDate} to {toDate}</h3>
          </div>
          <table>
            <tbody>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>CASH INFLOWS</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Receipts from Customers</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.cashIn)}</td>
              </tr>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>CASH OUTFLOWS</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Payments to Suppliers</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>({fmt(reportData.cashOutSuppliers)})</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Expense Payments</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>({fmt(reportData.cashOutExpenses)})</td>
              </tr>
              <tr style={{ background: reportData.netCash >= 0 ? '#ecfdf3' : '#fef3f2', borderTop: '2px solid var(--border)' }}>
                <td style={{ fontWeight: 700, padding: '14px 16px', fontSize: '15px', color: reportData.netCash >= 0 ? 'var(--green)' : 'var(--red)' }}>NET CASH FLOW</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, fontSize: '15px', color: reportData.netCash >= 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.netCash)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {reportData && (reportData.type === 'aged_rec' || reportData.type === 'aged_pay') && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>{reportData.type === 'aged_rec' ? 'Aged Receivables' : 'Aged Payables'}</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['Current', 'badge-green'], ['1-30 days', 'badge-yellow'], ['31-60 days', 'badge-yellow'], ['61-90 days', 'badge-red'], ['90+ days', 'badge-red']].map(([label, cls]) => (
                <span key={label} className={`badge ${cls}`}>{label}</span>
              ))}
            </div>
          </div>
          {reportData.items.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">✅</div><h3>All clear!</h3><p>No outstanding {reportData.type === 'aged_rec' ? 'receivables' : 'payables'}</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{reportData.type === 'aged_rec' ? 'Customer' : 'Supplier'}</th>
                  <th>Doc #</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th>Balance</th>
                  <th>Aging</th>
                </tr>
              </thead>
              <tbody>
                {reportData.items.map((item: any, i: number) => {
                  const aging = item.daysOverdue <= 0 ? 'Current' : item.daysOverdue <= 30 ? '1-30 days' : item.daysOverdue <= 60 ? '31-60 days' : item.daysOverdue <= 90 ? '61-90 days' : '90+ days'
                  const agingClass = item.daysOverdue <= 0 ? 'badge-green' : item.daysOverdue <= 30 ? 'badge-yellow' : 'badge-red'
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{reportData.type === 'aged_rec' ? item.customer_name : item.supplier_name}</td>
                      <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{reportData.type === 'aged_rec' ? item.invoice_number : item.bill_number}</td>
                      <td style={{ color: 'var(--text2)' }}>{item.date}</td>
                      <td style={{ color: item.daysOverdue > 0 ? 'var(--red)' : 'var(--text2)' }}>{item.due_date}</td>
                      <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(item.balance)}</td>
                      <td><span className={`badge ${agingClass}`}>{aging}</span></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg3)', fontWeight: 700 }}>
                  <td colSpan={4} style={{ padding: '12px 16px' }}>TOTAL</td>
                  <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.items.reduce((s: number, i: any) => s + (i.balance || 0), 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {reportData && reportData.type === 'balance' && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Balance Sheet — As at {new Date().toLocaleDateString('en-LK')}</h3>
          </div>
          <table>
            <tbody>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>ASSETS</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Cash Balance (Est.)</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.max(0, reportData.cashBalance))}</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Accounts Receivable</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.totalReceivables)}</td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                <td style={{ padding: '10px 16px' }}>Total Assets</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--brand)', fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.max(0, reportData.cashBalance) + reportData.totalReceivables)}</td>
              </tr>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>LIABILITIES</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Accounts Payable</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.totalPayables)}</td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                <td style={{ padding: '10px 16px' }}>Total Liabilities</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.totalPayables)}</td>
              </tr>
              <tr style={{ background: 'var(--bg3)' }}>
                <td style={{ fontWeight: 700, padding: '10px 16px' }}>EQUITY</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 16px 10px 32px' }}>Retained Earnings</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: reportData.retainedEarnings >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(reportData.retainedEarnings)}</td>
              </tr>
              <tr style={{ background: '#ecfdf3', borderTop: '2px solid var(--border)' }}>
                <td style={{ fontWeight: 700, padding: '14px 16px', fontSize: '15px' }}>Total Equity</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, fontSize: '15px', color: reportData.retainedEarnings >= 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(reportData.retainedEarnings)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!reportData && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>Select a report and click Generate</h3>
          <p>Choose a report type above, set the date range, and click Generate Report</p>
        </div>
      )}
    </div>
  )
}
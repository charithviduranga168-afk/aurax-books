import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

type Account = {
  id: string
  code: string
  name: string
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
  sub_type: string
  description: string
  is_system: boolean
  is_active: boolean
  user_id: string
}

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

const SUB_TYPES: Record<string, string[]> = {
  Asset: ['Cash & Bank', 'Accounts Receivable', 'Inventory', 'Fixed Asset', 'Other Asset'],
  Liability: ['Accounts Payable', 'Credit Card', 'Loan', 'Tax Payable', 'Other Liability'],
  Equity: ['Owner Equity', 'Retained Earnings', 'Capital', 'Other Equity'],
  Income: ['Sales Revenue', 'Service Revenue', 'Other Income'],
  Expense: ['Cost of Goods Sold', 'Operating Expense', 'Payroll', 'Tax Expense', 'Other Expense'],
}

const TYPE_COLORS: Record<string, string> = {
  Asset: '#16a34a',
  Liability: '#dc2626',
  Equity: '#7c3aed',
  Income: '#0284c7',
  Expense: '#ea580c',
}

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash on Hand',           type: 'Asset',     sub_type: 'Cash & Bank',         description: 'Physical cash held by the business' },
  { code: '1100', name: 'Bank Account',            type: 'Asset',     sub_type: 'Cash & Bank',         description: 'Main business bank account' },
  { code: '1200', name: 'Petty Cash',              type: 'Asset',     sub_type: 'Cash & Bank',         description: 'Small cash fund for minor expenses' },
  { code: '1300', name: 'Accounts Receivable',     type: 'Asset',     sub_type: 'Accounts Receivable', description: 'Money owed by customers' },
  { code: '1400', name: 'Inventory',               type: 'Asset',     sub_type: 'Inventory',           description: 'Stock of goods for sale' },
  { code: '1500', name: 'Prepaid Expenses',        type: 'Asset',     sub_type: 'Other Asset',         description: 'Expenses paid in advance' },
  { code: '1600', name: 'Equipment',               type: 'Asset',     sub_type: 'Fixed Asset',         description: 'Business equipment and machinery' },
  { code: '1700', name: 'Vehicles',                type: 'Asset',     sub_type: 'Fixed Asset',         description: 'Business vehicles' },
  { code: '2000', name: 'Accounts Payable',        type: 'Liability', sub_type: 'Accounts Payable',    description: 'Money owed to suppliers' },
  { code: '2100', name: 'Tax Payable',             type: 'Liability', sub_type: 'Tax Payable',         description: 'Taxes owed to government' },
  { code: '2200', name: 'Salary Payable',          type: 'Liability', sub_type: 'Other Liability',     description: 'Salaries owed to employees' },
  { code: '2300', name: 'Bank Loan',               type: 'Liability', sub_type: 'Loan',                description: 'Long-term bank loan' },
  { code: '3000', name: 'Owner Capital',           type: 'Equity',    sub_type: 'Capital',             description: 'Capital invested by the owner' },
  { code: '3100', name: 'Retained Earnings',       type: 'Equity',    sub_type: 'Retained Earnings',   description: 'Accumulated profits retained in business' },
  { code: '3200', name: 'Drawings',                type: 'Equity',    sub_type: 'Owner Equity',        description: 'Owner withdrawals from the business' },
  { code: '4000', name: 'Sales Revenue',           type: 'Income',    sub_type: 'Sales Revenue',       description: 'Revenue from product sales' },
  { code: '4100', name: 'Service Revenue',         type: 'Income',    sub_type: 'Service Revenue',     description: 'Revenue from services provided' },
  { code: '4200', name: 'Other Income',            type: 'Income',    sub_type: 'Other Income',        description: 'Miscellaneous income' },
  { code: '5000', name: 'Cost of Goods Sold',      type: 'Expense',   sub_type: 'Cost of Goods Sold',  description: 'Direct cost of products sold' },
  { code: '5100', name: 'Salaries & Wages',        type: 'Expense',   sub_type: 'Payroll',             description: 'Employee salaries and wages' },
  { code: '5200', name: 'Rent Expense',            type: 'Expense',   sub_type: 'Operating Expense',   description: 'Office or warehouse rent' },
  { code: '5300', name: 'Utilities',               type: 'Expense',   sub_type: 'Operating Expense',   description: 'Electricity, water, internet' },
  { code: '5400', name: 'Marketing & Advertising', type: 'Expense',   sub_type: 'Operating Expense',   description: 'Marketing and advertising costs' },
  { code: '5500', name: 'Transportation',          type: 'Expense',   sub_type: 'Operating Expense',   description: 'Delivery and transport costs' },
  { code: '5600', name: 'Tax Expense',             type: 'Expense',   sub_type: 'Tax Expense',         description: 'Income and other taxes' },
  { code: '5700', name: 'Depreciation',            type: 'Expense',   sub_type: 'Operating Expense',   description: 'Depreciation of fixed assets' },
  { code: '5800', name: 'Miscellaneous Expense',   type: 'Expense',   sub_type: 'Other Expense',       description: 'Other general expenses' },
]

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#0284c7', '#16a34a', '#ea580c', '#dc2626']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
      border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: '14px',
      padding: '6px 0', marginBottom: '16px', fontWeight: 500,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      {label}
    </button>
  )
}

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—'

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [filterType, setFilterType] = useState('All')
  const [search, setSearch] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [form, setForm] = useState({
    code: '', name: '', type: 'Asset', sub_type: 'Cash & Bank', description: '', is_active: true
  })

  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selected, setSelected] = useState<Account | null>(null)
  const [journalLines, setJournalLines] = useState<any[]>([])
  const [loadingLines, setLoadingLines] = useState(false)

  useEffect(() => { loadAccounts() }, [])

  async function loadAccounts() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('code')
    setAccounts(data || [])
    setLoading(false)
  }

  async function openDetail(acc: Account) {
    setSelected(acc)
    setView('detail')
    setLoadingLines(true)
    const { data } = await supabase
      .from('journal_entry_lines')
      .select('*, journal_entries(entry_number, date, description, status)')
      .eq('account_id', acc.id)
      .order('created_at', { ascending: false })
    setJournalLines(data || [])
    setLoadingLines(false)
  }

  async function seedDefaultAccounts() {
    setSeeding(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    for (const a of DEFAULT_ACCOUNTS) {
      await supabase.from('chart_of_accounts').insert({
        ...a,
        user_id: user.id,
        is_system: true,
        is_active: true,
      })
    }
    await loadAccounts()
    setSeeding(false)
  }

  function openAdd() {
    setEditAccount(null)
    setForm({ code: '', name: '', type: 'Asset', sub_type: 'Cash & Bank', description: '', is_active: true })
    setShowForm(true)
  }

  function openEdit(acc: Account) {
    setEditAccount(acc)
    setForm({
      code: acc.code, name: acc.name, type: acc.type,
      sub_type: acc.sub_type, description: acc.description || '', is_active: acc.is_active
    })
    setShowForm(true)
  }

  async function saveAccount() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (!form.code || !form.name) return alert('Code and Name are required')
    if (editAccount) {
      await supabase.from('chart_of_accounts').update({
        code: form.code, name: form.name, type: form.type,
        sub_type: form.sub_type, description: form.description, is_active: form.is_active
      }).eq('id', editAccount.id)
    } else {
      await supabase.from('chart_of_accounts').insert({
        code: form.code, name: form.name, type: form.type,
        sub_type: form.sub_type, description: form.description,
        is_active: form.is_active, is_system: false, user_id: user.id
      })
    }
    setShowForm(false)
    loadAccounts()
  }

  async function toggleActive(acc: Account) {
    await supabase.from('chart_of_accounts').update({ is_active: !acc.is_active }).eq('id', acc.id)
    loadAccounts()
  }

  async function deleteAccount(acc: Account) {
    if (acc.is_system) return alert('System accounts cannot be deleted.')
    if (!confirm(`Delete account ${acc.code} - ${acc.name}?`)) return
    await supabase.from('chart_of_accounts').delete().eq('id', acc.id)
    loadAccounts()
  }

  const filtered = accounts.filter(a => {
    const matchType = filterType === 'All' || a.type === filterType
    const matchSearch = !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const grouped = ACCOUNT_TYPES.reduce((acc, type) => {
    const items = filtered.filter(a => a.type === type)
    if (items.length > 0) acc[type] = items
    return acc
  }, {} as Record<string, Account[]>)

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const totalDebit = journalLines.reduce((s, l) => s + (l.debit || 0), 0)
    const totalCredit = journalLines.reduce((s, l) => s + (l.credit || 0), 0)
    const balance = totalDebit - totalCredit

    return (
      <div>
        <BackBtn label="Chart of Accounts" onClick={() => { setView('list'); setSelected(null) }} />

        {/* Hero card */}
        <div className="card" style={{ marginBottom: '16px', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <Avatar name={selected.name} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: '18px', fontWeight: 700,
                  color: TYPE_COLORS[selected.type],
                  background: `${TYPE_COLORS[selected.type]}15`,
                  padding: '2px 10px', borderRadius: '6px',
                }}>
                  {selected.code}
                </span>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{selected.name}</h2>
                <span style={{
                  fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '20px',
                  background: `${TYPE_COLORS[selected.type]}20`,
                  color: TYPE_COLORS[selected.type],
                  border: `1px solid ${TYPE_COLORS[selected.type]}40`,
                }}>
                  {selected.type}
                </span>
                {selected.is_system && <span className="badge badge-blue">System</span>}
                <span className={`badge ${selected.is_active ? 'badge-green' : 'badge-red'}`}>
                  {selected.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '8px' }}>
                {selected.sub_type}
                {selected.description ? ` · ${selected.description}` : ''}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => { setView('list'); openEdit(selected) }}
            >
              Edit
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total Debits', value: fmt(totalDebit), color: '#16a34a' },
            { label: 'Total Credits', value: fmt(totalCredit), color: '#dc2626' },
            { label: 'Net Balance', value: fmt(Math.abs(balance)), color: balance >= 0 ? '#16a34a' : '#dc2626' },
            { label: 'Entries', value: String(journalLines.length), color: 'var(--brand)' },
          ].map(kpi => (
            <div key={kpi.label} className="card" style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: kpi.color, marginTop: '6px' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Journal entries */}
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Journal Entries</h3>
          </div>
          {loadingLines ? (
            <div className="empty-state"><p>Loading entries...</p></div>
          ) : journalLines.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📒</div>
              <h3>No journal entries</h3>
              <p>No transactions have been posted to this account yet</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entry #</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Debit</th>
                  <th style={{ textAlign: 'right' }}>Credit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {journalLines.map((line, i) => (
                  <tr key={line.id || i}>
                    <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                      {line.journal_entries?.entry_number || '—'}
                    </td>
                    <td style={{ color: 'var(--text2)' }}>
                      {fmtDate(line.journal_entries?.date)}
                    </td>
                    <td>{line.description || line.journal_entries?.description || '—'}</td>
                    <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: line.debit > 0 ? 600 : 400 }}>
                      {line.debit > 0 ? fmt(line.debit) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: line.credit > 0 ? 600 : 400 }}>
                      {line.credit > 0 ? fmt(line.credit) : '—'}
                    </td>
                    <td>
                      {line.journal_entries?.status && (
                        <span className={`badge ${line.journal_entries.status === 'Posted' ? 'badge-green' : 'badge-blue'}`}>
                          {line.journal_entries.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Chart of Accounts</div>
          <div className="page-sub">Manage your account structure for bookkeeping</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {accounts.length === 0 && (
            <button className="btn btn-secondary" onClick={seedDefaultAccounts} disabled={seeding}>
              {seeding ? 'Setting up...' : '⚡ Load Default Accounts'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : openAdd())}>
            {showForm ? 'Close' : '+ New Account'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">{editAccount ? 'Edit Account' : 'New Account'}</div>
            <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          <div className="inline-panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
              <div className="form-group">
                <label>Account Code *</label>
                <input
                  placeholder="e.g. 1100"
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Account Name *</label>
                <input
                  placeholder="e.g. Bank Account"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label>Account Type *</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, sub_type: SUB_TYPES[e.target.value][0] })}>
                  {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Sub Type *</label>
                <select value={form.sub_type} onChange={e => setForm({ ...form, sub_type: e.target.value })}>
                  {SUB_TYPES[form.type].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input
                placeholder="Brief description of this account"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                Active account
              </label>
            </div>
            {form.sub_type === 'Cash & Bank' && (
              <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--brand)' }}>
                💡 Cash & Bank accounts will be available as payment methods in Invoices, Receipts, Bills and Payments.
              </div>
            )}
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAccount}>
              {editAccount ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {ACCOUNT_TYPES.map(type => {
          const count = accounts.filter(a => a.type === type).length
          return (
            <div
              key={type}
              onClick={() => setFilterType(filterType === type ? 'All' : type)}
              style={{
                flex: '1', minWidth: '120px', padding: '14px 16px', borderRadius: '10px',
                background: filterType === type ? TYPE_COLORS[type] : 'var(--bg2)',
                border: `2px solid ${filterType === type ? TYPE_COLORS[type] : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 700, color: filterType === type ? '#fff' : TYPE_COLORS[type] }}>{count}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: filterType === type ? 'rgba(255,255,255,0.85)' : 'var(--text2)', marginTop: '2px' }}>{type}s</div>
            </div>
          )
        })}
      </div>

      {/* Search + filter */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Search by code or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
          />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="All">All Types</option>
            {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="empty-state"><p>Loading accounts...</p></div>}

      {!loading && accounts.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No accounts yet</h3>
          <p>Load the default Sri Lankan SME chart of accounts or create your own</p>
          <button className="btn btn-primary" onClick={seedDefaultAccounts} disabled={seeding}>
            {seeding ? 'Setting up...' : '⚡ Load Default Accounts'}
          </button>
        </div>
      )}

      {/* Grouped account tables */}
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="table-wrap" style={{ marginBottom: '20px' }}>
          <div className="table-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: TYPE_COLORS[type], display: 'inline-block',
              }} />
              <h3 style={{ margin: 0 }}>{type}s</h3>
              <span className="badge badge-blue">{items.length}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Code</th>
                <th>Account Name</th>
                <th>Sub Type</th>
                <th>Description</th>
                <th style={{ width: '80px' }}>Status</th>
                <th style={{ width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(acc => (
                <tr
                  key={acc.id}
                  style={{ opacity: acc.is_active ? 1 : 0.5, cursor: 'pointer' }}
                  onClick={() => openDetail(acc)}
                >
                  <td>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 700, fontSize: '13px',
                      color: TYPE_COLORS[acc.type], background: `${TYPE_COLORS[acc.type]}15`,
                      padding: '2px 8px', borderRadius: '4px',
                    }}>{acc.code}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{acc.name}</div>
                    {acc.is_system && <span style={{ fontSize: '10px', color: 'var(--text2)' }}>System</span>}
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: '13px' }}>{acc.sub_type}</td>
                  <td style={{ color: 'var(--text2)', fontSize: '13px' }}>{acc.description}</td>
                  <td>
                    <span
                      className={`badge ${acc.is_active ? 'badge-green' : 'badge-red'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); toggleActive(acc) }}
                    >
                      {acc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => openEdit(acc)}>Edit</button>
                      {!acc.is_system && (
                        <button className="btn" style={{ padding: '4px 10px', fontSize: '12px', background: 'var(--red-light)', color: 'var(--red)' }} onClick={() => deleteAccount(acc)}>Del</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

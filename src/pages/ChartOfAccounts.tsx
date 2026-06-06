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

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [filterType, setFilterType] = useState('All')
  const [search, setSearch] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [form, setForm] = useState({
    code: '', name: '', type: 'Asset', sub_type: 'Cash & Bank', description: '', is_active: true
  })

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
    setShowModal(true)
  }

  function openEdit(acc: Account) {
    setEditAccount(acc)
    setForm({
      code: acc.code, name: acc.name, type: acc.type,
      sub_type: acc.sub_type, description: acc.description || '', is_active: acc.is_active
    })
    setShowModal(true)
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
    setShowModal(false)
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
          <button className="btn btn-primary" onClick={openAdd}>+ New Account</button>
        </div>
      </div>

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
                cursor: 'pointer', transition: 'all 0.15s'
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
                background: TYPE_COLORS[type], display: 'inline-block'
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
                <tr key={acc.id} style={{ opacity: acc.is_active ? 1 : 0.5 }}>
                  <td>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 700, fontSize: '13px',
                      color: TYPE_COLORS[acc.type], background: `${TYPE_COLORS[acc.type]}15`,
                      padding: '2px 8px', borderRadius: '4px'
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
                      onClick={() => toggleActive(acc)}
                    >
                      {acc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2>{editAccount ? 'Edit Account' : 'New Account'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
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
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAccount}>
                {editAccount ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
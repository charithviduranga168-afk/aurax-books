import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Expenses() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: '',
    payment_method: 'Cash',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [expRes, catRes, settRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase
        .from('categories')
        .select('name')
        .eq('user_id', user.id)
        .eq('type', 'Expense')
        .order('name'),
      supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    setExpenses(expRes.data || []);
    setCategories((catRes.data || []).map((c: any) => c.name));
    setCompany(settRes.data || {});
    setLoading(false);
  }

  function generateExpenseNumber(existing: any[]) {
    if (existing.length === 0) return 'EXP-0001';
    const nums = existing.map((e) => {
      const m = e.expense_number?.match(/(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    return 'EXP-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  function openAdd() {
    setEditing(null);
    setForm({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: '',
      payment_method: 'Cash',
      reference: '',
      notes: '',
    });
    setShowForm(true);
  }

  function openEdit(e: any) {
    setEditing(e);
    setForm({
      date: e.date,
      category: e.category || '',
      description: e.description || '',
      amount: String(e.amount),
      payment_method: e.payment_method || 'Cash',
      reference: e.reference || '',
      notes: e.notes || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.category || !form.amount)
      return alert('Please fill Category and Amount');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return alert('Enter a valid amount');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      date: form.date,
      category: form.category,
      description: form.description,
      amount,
      payment_method: form.payment_method,
      reference: form.reference,
      notes: form.notes,
    };

    if (editing) {
      await supabase.from('expenses').update(payload).eq('id', editing.id);
    } else {
      const expNumber = generateExpenseNumber(expenses);
      const { data: exp } = await supabase
        .from('expenses')
        .insert({ ...payload, user_id: user.id, expense_number: expNumber })
        .select()
        .single();
      if (exp) exportPDF(exp);
    }
    setSaving(false);
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    await supabase.from('expenses').delete().eq('id', id);
    loadData();
  }

  function exportPDF(exp: any) {
    const doc = new jsPDF();
    const fmt = (n: number) =>
      (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

    doc.setFillColor(248, 249, 252);
    doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, 0, 4, 42, 'F');

    doc.setTextColor(79, 53, 200);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'Company Name', 12, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('EXPENSE VOUCHER', 12, 21);

    let cy = 27;
    if (company.address) {
      doc.text(company.address, 12, cy);
      cy += 5;
    }
    if (company.phone) {
      doc.text('Tel: ' + company.phone, 12, cy);
      cy += 5;
    }
    if (company.email) {
      doc.text(company.email, 12, cy);
    }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(exp.expense_number, 198, 14, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + exp.date, 198, 22, { align: 'right' });

    doc.setDrawColor(79, 53, 200);
    doc.setLineWidth(0.5);
    doc.line(0, 42, 210, 42);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 120, 120);
    doc.text('EXPENSE DETAILS:', 12, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(exp.category, 12, 57);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Payment Method: ' + exp.payment_method, 12, 63);
    if (exp.reference) doc.text('Reference: ' + exp.reference, 12, 68);

    doc.setFillColor(240, 68, 56);
    doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('EXPENSE', 172, 53, { align: 'center' });

    autoTable(doc, {
      startY: 76,
      head: [['Category', 'Description', 'Amount (Rs.)']],
      body: [[exp.category, exp.description || '—', fmt(exp.amount)]],
      headStyles: {
        fillColor: [79, 53, 200],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 12, right: 12 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFillColor(240, 68, 56);
    doc.rect(120, finalY, 78, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AMOUNT:', 125, finalY + 8);
    doc.text('Rs. ' + fmt(exp.amount), 196, finalY + 8, { align: 'right' });

    if (exp.notes) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Notes: ' + exp.notes, 12, finalY + 22);
    }

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text(company.company_name || '', 14, pageH - 6);

    doc.save(exp.expense_number + '.pdf');
  }

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const defaultCategories = [
    'Rent',
    'Salaries',
    'Utilities',
    'Transport',
    'Marketing',
    'Office Supplies',
    'Repairs & Maintenance',
    'Telephone',
    'Finance Charges',
    'Other',
  ];
  const allCategories = [...new Set([...defaultCategories, ...categories])];

  const filtered = expenses.filter((e) => {
    const matchSearch =
      (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.category || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.expense_number || '').toLowerCase().includes(search.toLowerCase());
    return matchSearch && (!filterCategory || e.category === filterCategory);
  });

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyTotal = expenses
    .filter((e) => e.date?.startsWith(thisMonth))
    .reduce((s, e) => s + (e.amount || 0), 0);
  const byCategory = expenses.reduce((acc: any, e) => {
    acc[e.category] = (acc[e.category] || 0) + (e.amount || 0);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Expenses</div>
          <div className="page-sub">
            This month: <strong>{fmt(monthlyTotal)}</strong>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? setShowForm(false) : openAdd())}
        >
          {showForm ? 'Close' : '+ Add Expense'}
        </button>
      </div>
      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">
                {editing ? 'Edit Expense' : 'Add Expense'}
              </div>
              {!editing && (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text2)',
                    marginTop: '2px',
                  }}
                >
                  Next: {generateExpenseNumber(expenses)}
                </div>
              )}
            </div>
            <button
              className="modal-close"
              onClick={() => setShowForm(false)}
            >
              ×
            </button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  <option value="">— Select Category —</option>
                  {allCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full">
                <label>Description</label>
                <input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="e.g. Monthly office rent"
                />
              </div>
              <div className="form-group">
                <label>Amount (LKR) *</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Payment Method</label>
                <select
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm({ ...form, payment_method: e.target.value })
                  }
                >
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>Online Payment</option>
                </select>
              </div>
              <div className="form-group">
                <label>Reference</label>
                <input
                  value={form.reference}
                  onChange={(e) =>
                    setForm({ ...form, reference: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : editing
                ? 'Save Changes'
                : 'Add & Print'}
            </button>
          </div>
        </div>
      )}

      {/* Category summary */}
      {Object.keys(byCategory).length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {Object.entries(byCategory)
            .slice(0, 6)
            .map(([cat, amt]: any) => (
              <div
                key={cat}
                className="card"
                style={{ borderTop: '3px solid var(--red)', cursor: 'pointer' }}
                onClick={() =>
                  setFilterCategory(filterCategory === cat ? '' : cat)
                }
              >
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text2)',
                    fontWeight: 600,
                    marginBottom: '6px',
                  }}
                >
                  {cat}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '15px',
                    color: 'var(--red)',
                  }}
                >
                  {fmt(amt)}
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>
            All Expenses{' '}
            {filtered.length > 0 && (
              <span
                style={{
                  color: 'var(--red)',
                  marginLeft: '8px',
                  fontSize: '13px',
                }}
              >
                {fmt(filtered.reduce((s, e) => s + (e.amount || 0), 0))}
              </span>
            )}
          </h3>
          <div className="table-actions">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{ minWidth: '140px' }}
            >
              <option value="">All Categories</option>
              {allCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3>No expenses yet</h3>
            <p>Record your business expenses here</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Expense #</th>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    {e.expense_number}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{e.date}</td>
                  <td>
                    <span className="badge badge-red">{e.category}</span>
                  </td>
                  <td>{e.description || '—'}</td>
                  <td
                    style={{
                      fontWeight: 700,
                      color: 'var(--red)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(e.amount)}
                  </td>
                  <td>
                    <span className="badge badge-blue">{e.payment_method}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(e)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => exportPDF(e)}
                      >
                        PDF
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(e.id)}
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

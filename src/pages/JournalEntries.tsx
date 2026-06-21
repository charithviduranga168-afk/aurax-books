import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Check, X, Search, BookOpen } from 'lucide-react';
import { StatusBar } from '../components/StatusBar';
import { Chatter, logChatter } from '../components/Chatter';

interface JournalLine {
  account_id: string;
  account_name: string;
  description: string;
  debit: number;
  credit: number;
}

const emptyLine = (): JournalLine => ({
  account_id: '',
  account_name: '',
  description: '',
  debit: 0,
  credit: 0,
});

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      {label}
    </button>
  );
}

const fmt = (n: number) =>
  'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

const STATUS_COLOR: Record<string, string> = { Draft: '#6b7280', Posted: '#059669' };

export default function JournalEntries() {
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    reference: '',
  });
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any>(null);
  const [detailLines, setDetailLines] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (view === 'detail' && selected) {
      fetchDetailLines(selected.id);
    }
  }, [view, selected]);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [entRes, coaRes, settRes] = await Promise.all([
      supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase
        .from('chart_of_accounts')
        .select('id,code,name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    setEntries(entRes.data || []);
    setAccounts(coaRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  async function fetchDetailLines(entryId: string) {
    const { data } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .eq('journal_entry_id', entryId);
    setDetailLines(data || []);
  }

  function generateEntryNumber(existing: any[]) {
    if (existing.length === 0) return 'JNL-0001';
    const nums = existing.map((e) => {
      const m = e.entry_number?.match(/(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    return 'JNL-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  function addLine() {
    setLines([...lines, emptyLine()]);
  }

  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof JournalLine, value: any) {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    if (field === 'account_id') {
      const acc = accounts.find((a) => a.id === value);
      updated[i].account_name = acc ? `${acc.code} - ${acc.name}` : '';
    }
    if (field === 'debit' && value > 0) updated[i].credit = 0;
    if (field === 'credit' && value > 0) updated[i].debit = 0;
    setLines(updated);
  }

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  function openAdd() {
    setForm({
      date: new Date().toISOString().split('T')[0],
      description: '',
      reference: '',
    });
    setLines([emptyLine(), emptyLine()]);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
  }

  async function handleSave() {
    if (!form.description) return alert('Please enter a description');
    const validLines = lines.filter(
      (l) => l.account_id && (l.debit > 0 || l.credit > 0)
    );
    if (validLines.length < 2)
      return alert('Add at least two line items with an account and amount');
    if (!isBalanced)
      return alert('Total debits must equal total credits before saving');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const entryNumber = generateEntryNumber(entries);

    const { data: entry, error } = await supabase
      .from('journal_entries')
      .insert({
        user_id: user.id,
        entry_number: entryNumber,
        date: form.date,
        description: form.description,
        reference: form.reference,
        status: 'Draft',
        total_debit: totalDebit,
        total_credit: totalCredit,
      })
      .select()
      .single();

    if (error) {
      alert('Error saving journal entry: ' + error.message);
      setSaving(false);
      return;
    }

    if (entry) {
      await supabase.from('journal_entry_lines').insert(
        validLines.map((l) => ({
          journal_entry_id: entry.id,
          account_id: l.account_id,
          account_name: l.account_name,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
        }))
      );
    }

    setSaving(false);
    setShowForm(false);
    loadData();
  }

  async function postEntry(entry: any) {
    if (
      !confirm(
        `Post journal entry ${entry.entry_number}? Posted entries cannot be edited or deleted.`
      )
    )
      return;
    await supabase
      .from('journal_entries')
      .update({ status: 'Posted' })
      .eq('id', entry.id);
    if (view === 'detail' && selected?.id === entry.id) {
      setSelected({ ...selected, status: 'Posted' });
    }
    loadData();
  }

  async function returnEntryToDraft(entry: any) {
    if (!confirm(`Return ${entry.entry_number} to Draft? This will allow editing again.`)) return;
    await supabase.from('journal_entries').update({ status: 'Draft' }).eq('id', entry.id);
    if (view === 'detail' && selected?.id === entry.id) setSelected({ ...selected, status: 'Draft' });
    void logChatter('journal_entry', entry.id, 'Status changed to Draft');
    loadData();
  }

  async function cancelEntry(entry: any) {
    if (!confirm(`Cancel ${entry.entry_number}? This cannot be undone.`)) return;
    await supabase.from('journal_entries').update({ status: 'Cancelled' }).eq('id', entry.id);
    if (view === 'detail' && selected?.id === entry.id) setSelected({ ...selected, status: 'Cancelled' });
    void logChatter('journal_entry', entry.id, 'Status changed to Cancelled');
    loadData();
  }

  async function deleteEntry(entry: any) {
    if (entry.status !== 'Draft') return;
    if (!confirm(`Delete draft entry ${entry.entry_number}?`)) return;
    await supabase
      .from('journal_entry_lines')
      .delete()
      .eq('journal_entry_id', entry.id);
    await supabase.from('journal_entries').delete().eq('id', entry.id);
    if (view === 'detail') {
      setView('list');
      setSelected(null);
    }
    loadData();
  }

  async function handlePDF(entry: any) {
    const { data } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .eq('journal_entry_id', entry.id);
    exportPDF(entry, data || []);
  }

  function exportPDF(entry: any, lineItems: any[]) {
    const doc = new jsPDF();
    const fmtPDF = (n: number) =>
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
    doc.text('JOURNAL ENTRY', 12, 21);

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
    doc.text(entry.entry_number, 198, 14, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + entry.date, 198, 22, { align: 'right' });

    const sc = entry.status === 'Posted' ? [18, 183, 106] : [247, 144, 9];
    doc.setFillColor(sc[0], sc[1], sc[2]);
    doc.roundedRect(160, 27, 38, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text((entry.status || 'DRAFT').toUpperCase(), 179, 33, {
      align: 'center',
    });

    doc.setDrawColor(79, 53, 200);
    doc.setLineWidth(0.5);
    doc.line(0, 42, 210, 42);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 120, 120);
    doc.text('DESCRIPTION:', 12, 50);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(entry.description || '—', 12, 57);
    if (entry.reference) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Reference: ' + entry.reference, 12, 63);
    }

    const totalDebitVal = lineItems.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCreditVal = lineItems.reduce((s, l) => s + (l.credit || 0), 0);
    const balanced = Math.abs(totalDebitVal - totalCreditVal) < 0.01;

    autoTable(doc, {
      startY: 72,
      head: [['Account', 'Description', 'Debit (Rs.)', 'Credit (Rs.)']],
      body: lineItems.map((l) => [
        l.account_name,
        l.description || '—',
        l.debit > 0 ? fmtPDF(l.debit) : '—',
        l.credit > 0 ? fmtPDF(l.credit) : '—',
      ]),
      foot: [['', 'TOTAL', fmtPDF(totalDebitVal), fmtPDF(totalCreditVal)]],
      headStyles: {
        fillColor: [79, 53, 200],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      footStyles: {
        fillColor: [245, 246, 250],
        textColor: [30, 30, 30],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
      margin: { left: 12, right: 12 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    const bc = balanced ? [18, 183, 106] : [240, 68, 56];
    doc.setFillColor(bc[0], bc[1], bc[2]);
    doc.roundedRect(12, finalY, 110, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(
      balanced
        ? `Balanced — Debits = Credits = Rs. ${fmtPDF(totalDebitVal)}`
        : 'Not Balanced — Debits ≠ Credits',
      67,
      finalY + 6.5,
      { align: 'center' }
    );

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Generated by LedgerX', 105, pageH - 6, { align: 'center' });

    doc.save(entry.entry_number + '.pdf');
  }

  const filtered = entries.filter(
    (e) =>
      (e.entry_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── DETAIL VIEW ──
  if (view === 'detail' && selected) {
    const e = entries.find(x => x.id === selected.id) || selected;
    const dlTotalDebit = detailLines.reduce((s, l) => s + (l.debit || 0), 0);
    const dlTotalCredit = detailLines.reduce((s, l) => s + (l.credit || 0), 0);
    const dlBalanced = detailLines.length > 0 && Math.abs(dlTotalDebit - dlTotalCredit) < 0.01;

    return (
      <div>
        <BackBtn label="Back to Journals" onClick={() => { setView('list'); setSelected(null); setDetailLines([]); }} />

        {/* Hero card */}
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 24, padding: '24px 28px' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand)', marginBottom: 6 }}>{e.entry_number}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)', marginBottom: 4 }}>{e.description}</div>
            {e.reference && <div style={{ fontSize: 13, color: 'var(--text3)' }}>Ref: {e.reference}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: (STATUS_COLOR[e.status] || '#6b7280') + '18', color: STATUS_COLOR[e.status] || '#6b7280' }}>
              {e.status}
            </span>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{fmtDate(e.date)}</div>
          </div>
        </div>

        <StatusBar steps={['Draft', 'Posted']} current={e.status} />

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Debit', value: fmt(e.total_debit), color: '#2563eb' },
            { label: 'Total Credit', value: fmt(e.total_credit), color: '#059669' },
            { label: 'Status', value: e.status, color: STATUS_COLOR[e.status] || '#6b7280' },
            { label: 'Date', value: fmtDate(e.date), color: '#7c3aed' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', border: '1px solid #ede9f7', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {e.status === 'Draft' && (
            <button className="btn btn-secondary" onClick={() => postEntry(e)}>Post Entry</button>
          )}
          {e.status === 'Posted' && (
            <button className="btn btn-secondary" onClick={() => returnEntryToDraft(e)}>Return to Draft</button>
          )}
          {e.status !== 'Cancelled' && (
            <button className="btn btn-danger" onClick={() => cancelEntry(e)}>Cancel</button>
          )}
          {e.status === 'Draft' && (
            <button className="btn btn-danger" onClick={() => deleteEntry(e)}>Delete</button>
          )}
          <button className="btn btn-primary" onClick={() => handlePDF(e)}>PDF</button>
        </div>

        {/* Lines */}
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Journal Lines</h3>
            {detailLines.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 700, color: dlBalanced ? '#059669' : '#dc2626' }}>
                {dlBalanced ? <><Check size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />Balanced</> : <><X size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />Out of Balance</>}
              </span>
            )}
          </div>
          {detailLines.length === 0 ? (
            <div className="empty-state"><p>Loading lines...</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Debit</th>
                  <th style={{ textAlign: 'right' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {detailLines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{l.account_name}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 13 }}>{l.description || '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.debit > 0 ? fmt(l.debit) : '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.credit > 0 ? fmt(l.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800, background: '#f8f7ff' }}>
                  <td>TOTAL</td>
                  <td></td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(dlTotalDebit)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(dlTotalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <Chatter recordType="journal_entry" recordId={selected.id} />
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Journal Entries</div>
          <div className="page-sub">Double-entry bookkeeping records</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? closeForm() : openAdd())}
        >
          {showForm ? 'Close' : '+ New Journal Entry'}
        </button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">New Journal Entry</div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text2)',
                  marginTop: '2px',
                }}
              >
                Next: {generateEntryNumber(entries)}
              </div>
            </div>
            <button className="modal-close" onClick={closeForm}>
              ×
            </button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Reference</label>
                <input
                  value={form.reference}
                  onChange={(e) =>
                    setForm({ ...form, reference: e.target.value })
                  }
                  placeholder="Optional reference"
                />
              </div>
              <div className="form-group full">
                <label>Description *</label>
                <input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="What is this entry for?"
                />
              </div>
            </div>

            <div className="section-header">LINE ITEMS</div>
            <div className="line-items">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Account</th>
                    <th style={{ width: '28%' }}>Description</th>
                    <th style={{ width: '17%' }}>Debit</th>
                    <th style={{ width: '17%' }}>Credit</th>
                    <th style={{ width: '10%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select
                          value={line.account_id}
                          onChange={(e) =>
                            updateLine(i, 'account_id', e.target.value)
                          }
                        >
                          <option value="">— Select Account —</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={line.description}
                          onChange={(e) =>
                            updateLine(i, 'description', e.target.value)
                          }
                          placeholder="Optional"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.debit || ''}
                          min="0"
                          onChange={(e) =>
                            updateLine(
                              i,
                              'debit',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0.00"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.credit || ''}
                          min="0"
                          onChange={(e) =>
                            updateLine(
                              i,
                              'credit',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0.00"
                        />
                      </td>
                      <td>
                        {lines.length > 2 && (
                          <button
                            onClick={() => removeLine(i)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--red)',
                              cursor: 'pointer',
                              fontSize: '16px',
                            }}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="line-add-btn" onClick={addLine}>
                + Add Line
              </button>
            </div>

            <div className="totals-box">
              <div className="total-row">
                <span className="total-label">Total Debit:</span>
                <span className="total-value">{fmt(totalDebit)}</span>
              </div>
              <div className="total-row">
                <span className="total-label">Total Credit:</span>
                <span className="total-value">{fmt(totalCredit)}</span>
              </div>
              <div className="total-row total-final">
                <span className="total-label">
                  {isBalanced ? <><Check size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />Balanced</> : <><X size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />Out of Balance</>}
                </span>
                <span
                  className="total-value"
                  style={{ color: isBalanced ? 'var(--green)' : 'var(--red)' }}
                >
                  {isBalanced
                    ? 'Debits = Credits'
                    : `Difference: ${fmt(Math.abs(totalDebit - totalCredit))}`}
                </span>
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={closeForm}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !isBalanced}
            >
              {saving ? 'Saving...' : 'Save Journal Entry'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Entries</h3>
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              placeholder="Search entries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><BookOpen size={32} color="#7c3aed" /></div>
            <h3>No journal entries yet</h3>
            <p>Record manual double-entry transactions</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Entry #</th>
                <th>Date</th>
                <th>Description</th>
                <th>Status</th>
                <th>Total Debit</th>
                <th>Total Credit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => { setSelected(e); setView('detail'); }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    {e.entry_number}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{fmtDate(e.date)}</td>
                  <td>{e.description}</td>
                  <td>
                    <span
                      style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: (STATUS_COLOR[e.status] || '#6b7280') + '18', color: STATUS_COLOR[e.status] || '#6b7280' }}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td
                    style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmt(e.total_debit)}
                  </td>
                  <td
                    style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmt(e.total_credit)}
                  </td>
                  <td onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {e.status === 'Draft' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => postEntry(e)}
                        >
                          Post
                        </button>
                      )}
                      {e.status === 'Draft' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteEntry(e)}
                        >
                          Delete
                        </button>
                      )}
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handlePDF(e)}
                      >
                        PDF
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

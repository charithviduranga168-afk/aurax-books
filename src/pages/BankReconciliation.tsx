import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface BankAccount {
  id: string; name: string; bank_name: string;
  account_number: string; opening_balance: number; current_balance: number; currency: string;
}

interface BankTx {
  id: string; bank_account_id: string; date: string; description: string;
  reference: string | null; debit: number; credit: number; balance: number | null;
  is_reconciled: boolean; reconciled_ref: string | null; reconciled_type: string | null;
}

interface BookEntry {
  id: string; type: 'receipt' | 'payment' | 'expense';
  date: string; reference: string; description: string; amount: number;
}

const TABS = ['Accounts', 'Statement', 'Reconcile'];

export default function BankReconciliation() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [bookEntries, setBookEntries] = useState<BookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  // Account form
  const [showAccForm, setShowAccForm] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', bank_name: '', account_number: '', opening_balance: '0', currency: 'LKR' });
  const [savingAcc, setSavingAcc] = useState(false);
  const [editAccId, setEditAccId] = useState<string | null>(null);

  // Transaction form
  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({ date: new Date().toISOString().split('T')[0], description: '', reference: '', type: 'credit', amount: '', balance: '' });
  const [savingTx, setSavingTx] = useState(false);

  // Reconcile
  const [selectedBankTx, setSelectedBankTx] = useState<string | null>(null);
  const [selectedBookEntry, setSelectedBookEntry] = useState<string | null>(null);

  const [dialog, setDialog] = useState<{ msg: string; type: 'alert' | 'confirm'; onOk?: () => void } | null>(null);
  const showAlert = (msg: string) => setDialog({ msg, type: 'alert' });
  const showConfirm = (msg: string, onOk: () => void) => setDialog({ msg, type: 'confirm', onOk });

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (selectedAccount) loadTransactions(selectedAccount); }, [selectedAccount]);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [accRes, recRes, payRes, expRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').eq('user_id', user.id).order('name'),
      supabase.from('receipts').select('id,receipt_number,date,amount,customer_name').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('payments').select('id,payment_number,date,amount,supplier_name').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('expenses').select('id,date,description,amount').eq('user_id', user.id).order('date', { ascending: false }),
    ]);

    setAccounts(accRes.data || []);
    if (accRes.data?.length && !selectedAccount) setSelectedAccount(accRes.data[0].id);

    const entries: BookEntry[] = [
      ...(recRes.data || []).map((r: any) => ({ id: r.id, type: 'receipt' as const, date: r.date, reference: r.receipt_number || 'REC', description: `Receipt from ${r.customer_name}`, amount: r.amount })),
      ...(payRes.data || []).map((p: any) => ({ id: p.id, type: 'payment' as const, date: p.date, reference: p.payment_number || 'PAY', description: `Payment to ${p.supplier_name}`, amount: p.amount })),
      ...(expRes.data || []).map((e: any) => ({ id: e.id, type: 'expense' as const, date: e.date, reference: 'EXP', description: e.description, amount: e.amount })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    setBookEntries(entries);
    setLoading(false);
  }

  async function loadTransactions(accountId: string) {
    const { data } = await supabase.from('bank_transactions').select('*').eq('bank_account_id', accountId).order('date', { ascending: false });
    setTransactions(data || []);
  }

  // ── Account CRUD ──
  async function saveAccount() {
    if (!accForm.name.trim()) { showAlert('Account name is required.'); return; }
    setSavingAcc(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingAcc(false); return; }
    const payload = {
      user_id: user.id,
      name: accForm.name.trim(),
      bank_name: accForm.bank_name.trim(),
      account_number: accForm.account_number.trim(),
      opening_balance: parseFloat(accForm.opening_balance) || 0,
      current_balance: parseFloat(accForm.opening_balance) || 0,
      currency: accForm.currency,
    };
    if (editAccId) {
      await supabase.from('bank_accounts').update(payload).eq('id', editAccId);
    } else {
      const { data } = await supabase.from('bank_accounts').insert(payload).select().single();
      if (data) setSelectedAccount(data.id);
    }
    setSavingAcc(false);
    setShowAccForm(false);
    setEditAccId(null);
    setAccForm({ name: '', bank_name: '', account_number: '', opening_balance: '0', currency: 'LKR' });
    loadAll();
  }

  async function deleteAccount(id: string) {
    showConfirm('Delete this bank account and all its transactions?', async () => {
      await supabase.from('bank_accounts').delete().eq('id', id);
      if (selectedAccount === id) setSelectedAccount('');
      loadAll();
    });
  }

  // ── Transaction CRUD ──
  async function saveTransaction() {
    if (!selectedAccount) { showAlert('Select a bank account first.'); return; }
    if (!txForm.description.trim()) { showAlert('Description is required.'); return; }
    const amount = parseFloat(txForm.amount);
    if (!amount || amount <= 0) { showAlert('Enter a valid amount.'); return; }
    setSavingTx(true);
    await supabase.from('bank_transactions').insert({
      bank_account_id: selectedAccount,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      date: txForm.date,
      description: txForm.description.trim(),
      reference: txForm.reference.trim() || null,
      debit:  txForm.type === 'debit'  ? amount : 0,
      credit: txForm.type === 'credit' ? amount : 0,
      balance: parseFloat(txForm.balance) || null,
      is_reconciled: false,
    });
    setSavingTx(false);
    setShowTxForm(false);
    setTxForm({ date: new Date().toISOString().split('T')[0], description: '', reference: '', type: 'credit', amount: '', balance: '' });
    loadTransactions(selectedAccount);
  }

  async function deleteTx(id: string) {
    showConfirm('Delete this bank transaction?', async () => {
      await supabase.from('bank_transactions').delete().eq('id', id);
      loadTransactions(selectedAccount);
    });
  }

  // ── Reconcile ──
  async function reconcile() {
    if (!selectedBankTx || !selectedBookEntry) { showAlert('Select one bank transaction and one book entry to match.'); return; }
    const book = bookEntries.find((b) => b.id === selectedBookEntry);
    await supabase.from('bank_transactions').update({
      is_reconciled: true,
      reconciled_ref: book?.reference || '',
      reconciled_type: book?.type || '',
    }).eq('id', selectedBankTx);
    setSelectedBankTx(null);
    setSelectedBookEntry(null);
    loadTransactions(selectedAccount);
    showAlert('Matched! The bank transaction is now marked as reconciled.');
  }

  async function unreconcile(id: string) {
    await supabase.from('bank_transactions').update({ is_reconciled: false, reconciled_ref: null, reconciled_type: null }).eq('id', id);
    loadTransactions(selectedAccount);
  }

  const account = accounts.find((a) => a.id === selectedAccount);
  const unreconciledTxs   = transactions.filter((t) => !t.is_reconciled);
  const reconciledTxs     = transactions.filter((t) => t.is_reconciled);
  const totalCredits      = transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const totalDebits       = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const reconciledCount   = reconciledTxs.length;

  const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  const tabStyle = (i: number) => ({
    padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '13px', fontWeight: activeTab === i ? 700 : 500,
    background: activeTab === i ? 'var(--brand)' : 'transparent',
    color: activeTab === i ? '#fff' : 'var(--text2)',
  });

  const sLabel = { fontSize: '13px', fontWeight: 700, color: 'var(--brand)', marginBottom: '14px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: '28px 24px' }}>
            <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6 }}>{dialog.msg}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {dialog.type === 'confirm' && <button className="btn btn-danger" onClick={() => { dialog.onOk?.(); setDialog(null); }}>Confirm</button>}
              <button className="btn btn-secondary" onClick={() => setDialog(null)}>{dialog.type === 'alert' ? 'OK' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Bank Reconciliation</div>
          <div className="page-sub">Match bank statements to your book transactions</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg2)', padding: 4, borderRadius: 8, width: 'fit-content' }}>
        {TABS.map((t, i) => <button key={t} style={tabStyle(i)} onClick={() => setActiveTab(i)}>{t}</button>)}
      </div>

      {/* ── ACCOUNTS TAB ── */}
      {activeTab === 0 && (
        <div style={{ maxWidth: 800 }}>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={sLabel}>Bank Accounts</div>
              <button className="btn btn-primary" onClick={() => { setShowAccForm(!showAccForm); setEditAccId(null); setAccForm({ name: '', bank_name: '', account_number: '', opening_balance: '0', currency: 'LKR' }); }}>
                {showAccForm ? 'Cancel' : '+ Add Account'}
              </button>
            </div>

            {showAccForm && (
              <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{editAccId ? 'Edit Account' : 'New Bank Account'}</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Account Name *</label>
                    <input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="e.g. Main Current Account" />
                  </div>
                  <div className="form-group">
                    <label>Bank Name</label>
                    <input value={accForm.bank_name} onChange={(e) => setAccForm({ ...accForm, bank_name: e.target.value })} placeholder="e.g. Commercial Bank" />
                  </div>
                  <div className="form-group">
                    <label>Account Number</label>
                    <input value={accForm.account_number} onChange={(e) => setAccForm({ ...accForm, account_number: e.target.value })} placeholder="1234567890" />
                  </div>
                  <div className="form-group">
                    <label>Opening Balance (Rs.)</label>
                    <input type="number" value={accForm.opening_balance} onChange={(e) => setAccForm({ ...accForm, opening_balance: e.target.value })} />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={saveAccount} disabled={savingAcc}>{savingAcc ? 'Saving...' : 'Save Account'}</button>
              </div>
            )}

            {accounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>No bank accounts yet. Add one to start reconciling.</div>
            ) : (
              accounts.map((acc) => (
                <div key={acc.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🏦</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{acc.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{acc.bank_name}{acc.account_number ? ` · ${acc.account_number}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 15 }}>{fmt(acc.current_balance)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Opening: {fmt(acc.opening_balance)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditAccId(acc.id); setAccForm({ name: acc.name, bank_name: acc.bank_name, account_number: acc.account_number, opening_balance: String(acc.opening_balance), currency: acc.currency }); setShowAccForm(true); }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(acc.id)}>Del</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── STATEMENT TAB ── */}
      {activeTab === 1 && (
        <div>
          {/* Account selector + KPIs */}
          {accounts.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🏦</div><h3>No bank accounts</h3><p>Add a bank account in the Accounts tab first.</p><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setActiveTab(0)}>Add Account</button></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text1)', fontSize: 14, fontWeight: 600 }}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => setShowTxForm(!showTxForm)}>{showTxForm ? 'Cancel' : '+ Add Transaction'}</button>
              </div>

              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total Transactions', value: transactions.length },
                  { label: 'Total Credits (In)', value: fmt(totalCredits), color: '#16a34a' },
                  { label: 'Total Debits (Out)', value: fmt(totalDebits), color: '#dc2626' },
                  { label: 'Reconciled', value: `${reconciledCount} / ${transactions.length}`, color: 'var(--brand)' },
                ].map((k) => (
                  <div key={k.label} className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: k.color || 'var(--text1)' }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Add transaction form */}
              {showTxForm && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={sLabel}>New Bank Statement Line</div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Date</label>
                      <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Type</label>
                      <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}>
                        <option value="credit">Credit (Money In)</option>
                        <option value="debit">Debit (Money Out)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Amount (Rs.) *</label>
                      <input type="number" min="0" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.00" />
                    </div>
                    <div className="form-group">
                      <label>Running Balance (Rs.)</label>
                      <input type="number" value={txForm.balance} onChange={(e) => setTxForm({ ...txForm, balance: e.target.value })} placeholder="Optional" />
                    </div>
                    <div className="form-group full">
                      <label>Description *</label>
                      <input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="e.g. Customer payment received" />
                    </div>
                    <div className="form-group">
                      <label>Bank Reference</label>
                      <input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} placeholder="e.g. TRN123456" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={saveTransaction} disabled={savingTx}>{savingTx ? 'Saving...' : 'Add Transaction'}</button>
                    <button className="btn btn-secondary" onClick={() => setShowTxForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Statement table */}
              <div className="table-wrap">
                <div className="table-toolbar"><h3>Bank Statement — {account?.name}</h3></div>
                {transactions.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">📋</div><h3>No transactions</h3><p>Add bank statement lines manually</p></div>
                ) : (
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Description</th><th>Reference</th><th style={{ textAlign: 'right' }}>Credit (In)</th><th style={{ textAlign: 'right' }}>Debit (Out)</th><th style={{ textAlign: 'right' }}>Balance</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td style={{ fontSize: 13, color: 'var(--text2)' }}>{tx.date}</td>
                          <td style={{ fontWeight: 500 }}>{tx.description}</td>
                          <td style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace' }}>{tx.reference || '—'}</td>
                          <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: tx.credit ? 600 : 400 }}>{tx.credit ? fmt(tx.credit) : '—'}</td>
                          <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: tx.debit ? 600 : 400 }}>{tx.debit ? fmt(tx.debit) : '—'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{tx.balance !== null ? fmt(tx.balance) : '—'}</td>
                          <td>
                            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: tx.is_reconciled ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: tx.is_reconciled ? '#16a34a' : '#d97706' }}>
                              {tx.is_reconciled ? '✓ Matched' : 'Unmatched'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {tx.is_reconciled && <button className="btn btn-secondary btn-sm" onClick={() => unreconcile(tx.id)}>Unmatch</button>}
                              <button className="btn btn-danger btn-sm" onClick={() => deleteTx(tx.id)}>Del</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── RECONCILE TAB ── */}
      {activeTab === 2 && (
        <div>
          {accounts.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🏦</div><h3>No bank accounts</h3><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setActiveTab(0)}>Add Account</button></div>
          ) : (
            <>
              {/* Account selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text1)', fontSize: 14, fontWeight: 600 }}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {selectedBankTx && selectedBookEntry && (
                  <button className="btn btn-primary" onClick={reconcile}>Match Selected</button>
                )}
                {(selectedBankTx || selectedBookEntry) && (
                  <button className="btn btn-secondary" onClick={() => { setSelectedBankTx(null); setSelectedBookEntry(null); }}>Clear Selection</button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Unmatched bank transactions */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Bank Statement <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({unreconciledTxs.length} unmatched)</span></div>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>← Select to match</span>
                  </div>
                  <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                    {unreconciledTxs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>All transactions reconciled!</div>
                    ) : unreconciledTxs.map((tx) => (
                      <div key={tx.id} onClick={() => setSelectedBankTx(selectedBankTx === tx.id ? null : tx.id)}
                        style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedBankTx === tx.id ? 'rgba(124,58,237,0.08)' : '#fff', borderLeft: selectedBankTx === tx.id ? '3px solid var(--brand)' : '3px solid transparent', transition: 'background 0.1s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{tx.description}</div>
                          <div style={{ fontWeight: 700, color: tx.credit ? '#16a34a' : '#dc2626', fontSize: 13 }}>
                            {tx.credit ? '+' : '-'}{fmt(tx.credit || tx.debit)}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{tx.date}{tx.reference ? ` · ${tx.reference}` : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Book entries */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Book Entries <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({bookEntries.length})</span></div>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>← Select to match</span>
                  </div>
                  <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                    {bookEntries.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>No book entries found.</div>
                    ) : bookEntries.map((e) => {
                      const typeColors: Record<string, { color: string; bg: string; label: string }> = {
                        receipt: { color: '#16a34a', bg: 'rgba(34,197,94,0.08)', label: 'Receipt' },
                        payment: { color: '#dc2626', bg: 'rgba(239,68,68,0.08)', label: 'Payment' },
                        expense: { color: '#d97706', bg: 'rgba(245,158,11,0.08)', label: 'Expense' },
                      };
                      const tc = typeColors[e.type];
                      return (
                        <div key={`${e.type}-${e.id}`} onClick={() => setSelectedBookEntry(selectedBookEntry === `${e.type}-${e.id}` ? null : `${e.type}-${e.id}`)}
                          style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedBookEntry === `${e.type}-${e.id}` ? 'rgba(124,58,237,0.08)' : '#fff', borderLeft: selectedBookEntry === `${e.type}-${e.id}` ? '3px solid var(--brand)' : '3px solid transparent', transition: 'background 0.1s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <div style={{ flex: 1, paddingRight: 8 }}>
                              <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color, marginRight: 6 }}>{tc.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.description}</span>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: e.type === 'receipt' ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>
                              {e.type === 'receipt' ? '+' : '-'}{fmt(e.amount)}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.date} · {e.reference}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Reconciled list */}
              {reconciledTxs.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 24 }}>
                  <div className="table-toolbar"><h3>Reconciled Transactions ({reconciledTxs.length})</h3></div>
                  <table>
                    <thead><tr><th>Date</th><th>Description</th><th>Credit</th><th>Debit</th><th>Matched To</th><th></th></tr></thead>
                    <tbody>
                      {reconciledTxs.map((tx) => (
                        <tr key={tx.id}>
                          <td style={{ fontSize: 13, color: 'var(--text2)' }}>{tx.date}</td>
                          <td style={{ fontWeight: 500 }}>{tx.description}</td>
                          <td style={{ color: '#16a34a', fontWeight: tx.credit ? 600 : 400 }}>{tx.credit ? fmt(tx.credit) : '—'}</td>
                          <td style={{ color: '#dc2626', fontWeight: tx.debit ? 600 : 400 }}>{tx.debit ? fmt(tx.debit) : '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text2)' }}>{tx.reconciled_type} · {tx.reconciled_ref}</td>
                          <td><button className="btn btn-secondary btn-sm" onClick={() => unreconcile(tx.id)}>Unmatch</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

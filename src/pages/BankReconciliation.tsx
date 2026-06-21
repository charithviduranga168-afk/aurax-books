import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { Landmark, FolderOpen, AlertTriangle, ClipboardList, Check, CheckCircle, X, ArrowLeftRight } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

interface BankAccount {
  id: string; name: string; bank_name: string;
  account_number: string; opening_balance: number; current_balance: number; currency: string;
  coa_account_id?: string | null;
}
interface CoaAccount { id: string; code: string; name: string; type: string; }
interface BankTx {
  id: string; bank_account_id: string; date: string; description: string;
  reference: string | null; debit: number; credit: number; balance: number | null;
  is_reconciled: boolean; reconciled_ref: string | null; reconciled_type: string | null;
}
interface BookEntry {
  id: string; type: 'receipt' | 'payment' | 'expense' | 'journal';
  date: string; reference: string; description: string; amount: number; isDebit?: boolean;
}
interface ParsedTx {
  date: string; description: string; type: 'credit' | 'debit'; amount: number; balance: string; reference: string;
}

const TABS = ['Accounts', 'Statement', 'Reconcile'];

function normalizeDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m1) {
    const y = m1[3].length === 2 ? '20' + m1[3] : m1[3];
    return `${y}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  const m3 = s.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
  if (m3) {
    const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
    const mo = months[m3[2].toLowerCase()];
    return mo ? `${m3[3]}-${mo}-${m3[1].padStart(2, '0')}` : '';
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return '';
}

function parseAmount(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Math.abs(val);
  return Math.abs(parseFloat(String(val).replace(/[^0-9.\-]/g, '')) || 0);
}

function detectColumns(headers: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const s = String(h ?? '').toLowerCase().trim();
    if (/^(date|trans.?date|value.?date|posting.?date|txn.?date)$/.test(s)) map.date = i;
    else if (/^(description|narration|particulars|details|narrative|remarks|transaction)$/.test(s)) map.description = i;
    else if (/^(debit|withdrawal|dr\.?|amount.?dr)$/.test(s)) map.debit = i;
    else if (/^(credit|deposit|cr\.?|amount.?cr)$/.test(s)) map.credit = i;
    else if (s === 'amount') map.amount = i;
    else if (/^(balance|running.?balance|closing.?balance)$/.test(s)) map.balance = i;
    else if (/^(reference|ref|chq.?no|cheque.?no|transaction.?id|ref.?no)$/.test(s)) map.reference = i;
  });
  return map;
}

export default function BankReconciliation() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [bookEntries, setBookEntries] = useState<BookEntry[]>([]);
  const [jeEntries, setJeEntries] = useState<BookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState('');

  const [showAccForm, setShowAccForm] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', bank_name: '', account_number: '', opening_balance: '0', currency: 'LKR', coa_account_id: '' });
  const [savingAcc, setSavingAcc] = useState(false);
  const [editAccId, setEditAccId] = useState<string | null>(null);

  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({ date: new Date().toISOString().split('T')[0], description: '', reference: '', type: 'credit', amount: '', balance: '' });
  const [savingTx, setSavingTx] = useState(false);

  const [parsedTxs, setParsedTxs] = useState<ParsedTx[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [parseError, setParseError] = useState('');
  const [pdfRawText, setPdfRawText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedBankTx, setSelectedBankTx] = useState<string | null>(null);
  const [selectedBookEntry, setSelectedBookEntry] = useState<string | null>(null);
  const [bookSource, setBookSource] = useState<'erp' | 'journal'>('erp');
  const [selectedCoaId, setSelectedCoaId] = useState('');

  const [dialog, setDialog] = useState<{ msg: string; type: 'alert' | 'confirm'; onOk?: () => void } | null>(null);
  const showAlert = (msg: string) => setDialog({ msg, type: 'alert' });
  const showConfirm = (msg: string, onOk: () => void) => setDialog({ msg, type: 'confirm', onOk });

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (selectedAccount) loadTransactions(selectedAccount); }, [selectedAccount]);
  useEffect(() => { if (bookSource === 'journal' && selectedCoaId) loadJeEntries(selectedCoaId); }, [bookSource, selectedCoaId]);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [accRes, coaRes, recRes, payRes, expRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').eq('user_id', user.id).order('name'),
      supabase.from('chart_of_accounts').select('id,code,name,type').eq('user_id', user.id).eq('is_active', true).order('code'),
      supabase.from('receipts').select('id,receipt_number,date,amount,customer_name').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('payments').select('id,payment_number,date,amount,supplier_name').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('expenses').select('id,date,description,amount').eq('user_id', user.id).order('date', { ascending: false }),
    ]);
    setAccounts(accRes.data || []);
    setCoaAccounts(coaRes.data || []);
    if ((accRes.data?.length ?? 0) > 0 && !selectedAccount) setSelectedAccount(accRes.data![0].id);
    const entries: BookEntry[] = [
      ...(recRes.data || []).map((r: any) => ({ id: r.id, type: 'receipt' as const, date: r.date, reference: r.receipt_number || 'REC', description: `Receipt from ${r.customer_name}`, amount: r.amount, isDebit: false })),
      ...(payRes.data || []).map((p: any) => ({ id: p.id, type: 'payment' as const, date: p.date, reference: p.payment_number || 'PAY', description: `Payment to ${p.supplier_name}`, amount: p.amount, isDebit: true })),
      ...(expRes.data || []).map((e: any) => ({ id: e.id, type: 'expense' as const, date: e.date, reference: 'EXP', description: e.description, amount: e.amount, isDebit: true })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    setBookEntries(entries);
    setLoading(false);
  }

  async function loadTransactions(accountId: string) {
    const { data } = await supabase.from('bank_transactions').select('*').eq('bank_account_id', accountId).order('date', { ascending: false });
    setTransactions(data || []);
  }

  async function loadJeEntries(coaId: string) {
    const { data } = await supabase
      .from('journal_entry_lines')
      .select('id, account_id, description, debit, credit, journal_entries(je_number, date, reference, description)')
      .eq('account_id', coaId);
    if (!data) { setJeEntries([]); return; }
    setJeEntries(
      data.map((line: any) => {
        const je = Array.isArray(line.journal_entries) ? line.journal_entries[0] : line.journal_entries;
        const isDebit = (line.debit || 0) > 0;
        return {
          id: line.id, type: 'journal' as const,
          date: je?.date || '',
          reference: je?.je_number || 'JE',
          description: je?.description || line.description || 'Journal Entry',
          amount: isDebit ? (line.debit || 0) : (line.credit || 0),
          isDebit,
        };
      }).sort((a: BookEntry, b: BookEntry) => b.date.localeCompare(a.date))
    );
  }

  async function saveAccount() {
    if (!accForm.name.trim()) { showAlert('Account name is required.'); return; }
    setSavingAcc(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingAcc(false); return; }
    const payload: any = {
      user_id: user.id, name: accForm.name.trim(), bank_name: accForm.bank_name.trim(),
      account_number: accForm.account_number.trim(), opening_balance: parseFloat(accForm.opening_balance) || 0,
      current_balance: parseFloat(accForm.opening_balance) || 0, currency: accForm.currency,
      coa_account_id: accForm.coa_account_id || null,
    };
    if (editAccId) {
      await supabase.from('bank_accounts').update(payload).eq('id', editAccId);
    } else {
      const { data } = await supabase.from('bank_accounts').insert(payload).select().single();
      if (data) setSelectedAccount(data.id);
    }
    setSavingAcc(false); setShowAccForm(false); setEditAccId(null);
    setAccForm({ name: '', bank_name: '', account_number: '', opening_balance: '0', currency: 'LKR', coa_account_id: '' });
    loadAll();
  }

  async function deleteAccount(id: string) {
    showConfirm('Delete this bank account and all its transactions?', async () => {
      await supabase.from('bank_accounts').delete().eq('id', id);
      if (selectedAccount === id) setSelectedAccount('');
      loadAll();
    });
  }

  async function saveTransaction() {
    if (!selectedAccount) { showAlert('Select a bank account first.'); return; }
    if (!txForm.description.trim()) { showAlert('Description is required.'); return; }
    const amount = parseFloat(txForm.amount);
    if (!amount || amount <= 0) { showAlert('Enter a valid amount.'); return; }
    setSavingTx(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from('bank_transactions').insert({
      bank_account_id: selectedAccount, user_id: uid, date: txForm.date,
      description: txForm.description.trim(), reference: txForm.reference.trim() || null,
      debit: txForm.type === 'debit' ? amount : 0, credit: txForm.type === 'credit' ? amount : 0,
      balance: parseFloat(txForm.balance) || null, is_reconciled: false,
    });
    setSavingTx(false); setShowTxForm(false);
    setTxForm({ date: new Date().toISOString().split('T')[0], description: '', reference: '', type: 'credit', amount: '', balance: '' });
    loadTransactions(selectedAccount);
  }

  async function deleteTx(id: string) {
    showConfirm('Delete this bank transaction?', async () => {
      await supabase.from('bank_transactions').delete().eq('id', id);
      loadTransactions(selectedAccount);
    });
  }

  async function handleFile(file: File) {
    setParseError(''); setParsedTxs([]); setPdfRawText('');
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    setShowImport(true);
    if (['csv', 'xlsx', 'xls'].includes(ext)) await parseExcel(file);
    else if (ext === 'pdf') await parsePdf(file);
    else { setParseError('Unsupported file type. Use .xlsx, .xls, .csv, or .pdf'); }
  }

  async function parseExcel(file: File) {
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!rows.length) { setParseError('File appears to be empty.'); return; }

      let headerRow = 0;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        if (rows[i].filter((c: any) => c !== null && c !== undefined && c !== '').length >= 3) { headerRow = i; break; }
      }
      const headers = rows[headerRow];
      const col = detectColumns(headers);

      if (col.date === undefined) {
        setParseError('Could not detect a Date column. Ensure your file has a column named "Date", "Transaction Date", etc.');
        return;
      }

      const parsed: ParsedTx[] = [];
      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.filter((c: any) => c !== null && c !== undefined && c !== '').length < 2) continue;
        const dateStr = normalizeDate(row[col.date]);
        if (!dateStr) continue;
        const desc = col.description !== undefined ? String(row[col.description] ?? '').trim() : 'Bank Transaction';
        const ref = col.reference !== undefined ? String(row[col.reference] ?? '').trim() : '';
        const bal = col.balance !== undefined ? String(row[col.balance] ?? '').trim() : '';
        let debit = 0, credit = 0;
        if (col.debit !== undefined) debit = parseAmount(row[col.debit]);
        if (col.credit !== undefined) credit = parseAmount(row[col.credit]);
        if (col.amount !== undefined && !debit && !credit) {
          const n = typeof row[col.amount] === 'number' ? row[col.amount] : parseFloat(String(row[col.amount] ?? '').replace(/[^0-9.\-]/g, '')) || 0;
          if (n < 0) debit = Math.abs(n); else credit = n;
        }
        if (!debit && !credit) continue;
        parsed.push({ date: dateStr, description: desc || 'Bank Transaction', type: credit > 0 ? 'credit' : 'debit', amount: credit > 0 ? credit : debit, balance: bal, reference: ref });
      }

      if (!parsed.length) { setParseError('No transactions found. Verify the file has Date and Debit/Credit columns.'); return; }
      setParsedTxs(parsed);
    } catch (e: any) {
      setParseError('Failed to read file: ' + e.message);
    }
  }

  async function parsePdf(file: File) {
    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;

      // Collect all text items with their x,y positions
      type PdfItem = { str: string; x: number; y: number };
      const allItems: PdfItem[] = [];
      let rawText = '';

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        rawText += (tc.items as any[]).map((i: any) => i.str || '').join(' ') + '\n';
        for (const item of tc.items as any[]) {
          const s = (item.str || '').trim();
          if (!s) continue;
          allItems.push({
            str: s,
            x: Math.round(item.transform[4]),
            y: Math.round(vp.height - item.transform[5]),
          });
        }
      }

      setPdfRawText(rawText);

      // Group items into lines by y-coordinate (3pt tolerance)
      const lineMap = new Map<number, PdfItem[]>();
      for (const item of allItems) {
        let key = item.y;
        for (const [k] of lineMap) {
          if (Math.abs(k - item.y) <= 3) { key = k; break; }
        }
        if (!lineMap.has(key)) lineMap.set(key, []);
        lineMap.get(key)!.push(item);
      }
      const lines = [...lineMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, items]) => items.sort((a, b) => a.x - b.x));

      // Find header row to detect column x-positions
      let colDebit = -1, colCredit = -1, colBalance = -1;
      for (const line of lines) {
        const joined = line.map(i => i.str.toLowerCase()).join(' ');
        if (/debit|withdrawal|credit|deposit|paid.?in|paid.?out/.test(joined)) {
          for (const item of line) {
            const s = item.str.toLowerCase();
            if (/debit|withdrawal|paid.?out/.test(s) && !/credit/.test(s)) colDebit = item.x;
            else if (/credit|deposit|paid.?in/.test(s) && !/debit/.test(s)) colCredit = item.x;
            else if (/balance/.test(s)) colBalance = item.x;
          }
          if (colDebit > 0 || colCredit > 0) break;
        }
      }

      // Parse data rows
      const parsed: ParsedTx[] = [];
      const dateRe = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$|^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
      const amtRe = /^[\d,]+\.\d{2}$/;

      for (const line of lines) {
        const dateItem = line.find(i => dateRe.test(i.str));
        if (!dateItem) continue;
        const dateStr = normalizeDate(dateItem.str);
        if (!dateStr) continue;

        const amounts: { val: number; x: number; isDr: boolean; isCr: boolean }[] = [];
        let desc = '';

        for (let j = 0; j < line.length; j++) {
          const item = line[j];
          const cleaned = item.str.replace(/,/g, '');
          if (amtRe.test(cleaned)) {
            const nextStr = (line[j + 1]?.str || '').toLowerCase().trim();
            const prevStr = (line[j - 1]?.str || '').toLowerCase().trim();
            const isDr = /^(dr\.?|debit)$/.test(nextStr) || /^(dr\.?|debit)$/.test(prevStr);
            const isCr = /^(cr\.?|credit)$/.test(nextStr) || /^(cr\.?|credit)$/.test(prevStr);
            amounts.push({ val: parseFloat(cleaned), x: item.x, isDr, isCr });
          } else if (!dateRe.test(item.str) && !/^[-–]$/.test(item.str) && !/^(dr|cr)\.?$/i.test(item.str)) {
            desc += item.str + ' ';
          }
        }

        if (!amounts.length) continue;

        let debit = 0, credit = 0, balance = '';

        const drMarked = amounts.filter(a => a.isDr);
        const crMarked = amounts.filter(a => a.isCr);

        if (drMarked.length || crMarked.length) {
          // Explicit Dr/Cr markers found
          if (drMarked.length) debit = drMarked[0].val;
          if (crMarked.length) credit = crMarked[0].val;
          const unmarked = amounts.filter(a => !a.isDr && !a.isCr);
          if (unmarked.length) balance = String(unmarked[unmarked.length - 1].val);
        } else if (colDebit >= 0 || colCredit >= 0) {
          // Use column positions from header
          for (const { val, x } of amounts) {
            const dDeb = colDebit >= 0 ? Math.abs(x - colDebit) : Infinity;
            const dCre = colCredit >= 0 ? Math.abs(x - colCredit) : Infinity;
            const dBal = colBalance >= 0 ? Math.abs(x - colBalance) : Infinity;
            const min = Math.min(dDeb, dCre, dBal);
            if (dBal < Infinity && min === dBal) balance = String(val);
            else if (dDeb < Infinity && min === dDeb) debit = val;
            else if (dCre < Infinity && min === dCre) credit = val;
            else balance = String(val);
          }
        } else {
          // Fallback: sort by x — rightmost is balance, leftmost non-zero is transaction
          amounts.sort((a, b) => a.x - b.x);
          if (amounts.length >= 2) {
            balance = String(amounts[amounts.length - 1].val);
            const txAmts = amounts.slice(0, -1).filter(a => a.val > 0);
            if (txAmts.length === 1) {
              // Use relative x position: left of centre = debit, right = credit
              const lineSpan = amounts[amounts.length - 1].x - amounts[0].x;
              const mid = amounts[0].x + lineSpan / 2;
              if (txAmts[0].x < mid) debit = txAmts[0].val;
              else credit = txAmts[0].val;
            } else if (txAmts.length >= 2) {
              debit = txAmts[0].val; credit = txAmts[1].val;
            }
          } else {
            credit = amounts[0].val;
          }
        }

        if (!debit && !credit) continue;

        parsed.push({
          date: dateStr,
          description: desc.trim() || 'Transaction',
          type: credit > 0 && debit === 0 ? 'credit' : 'debit',
          amount: credit > 0 && debit === 0 ? credit : debit,
          balance,
          reference: '',
        });
      }

      if (parsed.length) setParsedTxs(parsed);
      else setParseError('Could not auto-parse transactions. Review the extracted text below, then enter manually.');
    } catch (e: any) {
      setParseError('Failed to read PDF: ' + e.message);
    }
  }

  async function importTransactions() {
    if (!selectedAccount || !parsedTxs.length) return;
    setImporting(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const rows = parsedTxs.map(tx => ({
      user_id: uid, bank_account_id: selectedAccount, date: tx.date, description: tx.description,
      reference: tx.reference || null, debit: tx.type === 'debit' ? tx.amount : 0, credit: tx.type === 'credit' ? tx.amount : 0,
      balance: parseFloat(tx.balance) || null, is_reconciled: false,
    }));
    const { error } = await supabase.from('bank_transactions').insert(rows);
    setImporting(false);
    if (error) { showAlert('Import failed: ' + error.message); return; }
    setParsedTxs([]); setPdfRawText(''); setShowImport(false); setParseError('');
    showAlert(`Imported ${rows.length} transactions successfully.`);
    loadTransactions(selectedAccount);
  }

  async function reconcile() {
    if (!selectedBankTx || !selectedBookEntry) { showAlert('Select one bank transaction and one book entry to match.'); return; }
    const src = bookSource === 'journal' ? jeEntries : bookEntries;
    const book = src.find((b) => b.id === selectedBookEntry);
    await supabase.from('bank_transactions').update({ is_reconciled: true, reconciled_ref: book?.reference || '', reconciled_type: book?.type || '' }).eq('id', selectedBankTx);
    setSelectedBankTx(null); setSelectedBookEntry(null);
    loadTransactions(selectedAccount);
    showAlert('Matched! Transaction is now reconciled.');
  }

  async function unreconcile(id: string) {
    await supabase.from('bank_transactions').update({ is_reconciled: false, reconciled_ref: null, reconciled_type: null }).eq('id', id);
    loadTransactions(selectedAccount);
  }

  const account = accounts.find((a) => a.id === selectedAccount);
  const unreconciledTxs = transactions.filter((t) => !t.is_reconciled);
  const reconciledTxs = transactions.filter((t) => t.is_reconciled);
  const totalCredits = transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const totalDebits = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const activeBookEntries = bookSource === 'journal' ? jeEntries : bookEntries;

  const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const tabStyle = (i: number): React.CSSProperties => ({
    padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
    fontWeight: activeTab === i ? 700 : 500, background: activeTab === i ? 'var(--brand)' : 'transparent',
    color: activeTab === i ? '#fff' : 'var(--text2)',
  });
  const sLabel: React.CSSProperties = { fontSize: '13px', fontWeight: 700, color: 'var(--brand)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' };

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
          <div className="page-sub">Match bank statements to your book entries</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg2)', padding: 4, borderRadius: 8, width: 'fit-content' }}>
        {TABS.map((t, i) => <button key={t} style={tabStyle(i)} onClick={() => setActiveTab(i)}>{t}</button>)}
      </div>

      {/* ── ACCOUNTS TAB ── */}
      {activeTab === 0 && (
        <div style={{ maxWidth: 800 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={sLabel}>Bank Accounts</div>
              <button className="btn btn-primary" onClick={() => { setShowAccForm(!showAccForm); setEditAccId(null); setAccForm({ name: '', bank_name: '', account_number: '', opening_balance: '0', currency: 'LKR', coa_account_id: '' }); }}>
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
                  <div className="form-group full">
                    <label>Link to Chart of Accounts (optional)</label>
                    <select value={accForm.coa_account_id} onChange={(e) => setAccForm({ ...accForm, coa_account_id: e.target.value })}>
                      <option value="">— Not linked —</option>
                      {coaAccounts.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name} ({c.type})</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={saveAccount} disabled={savingAcc}>{savingAcc ? 'Saving...' : 'Save Account'}</button>
              </div>
            )}

            {accounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>No bank accounts yet. Add one to start reconciling.</div>
            ) : accounts.map((acc) => {
              const linked = coaAccounts.find(c => c.id === acc.coa_account_id);
              return (
                <div key={acc.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Landmark size={20} color="#7c3aed" /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{acc.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{acc.bank_name}{acc.account_number ? ` · ${acc.account_number}` : ''}</div>
                    {linked && <div style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2 }}>CoA: {linked.code} – {linked.name}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 15 }}>{fmt(acc.current_balance)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Opening: {fmt(acc.opening_balance)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditAccId(acc.id); setAccForm({ name: acc.name, bank_name: acc.bank_name, account_number: acc.account_number, opening_balance: String(acc.opening_balance), currency: acc.currency, coa_account_id: acc.coa_account_id || '' }); setShowAccForm(true); }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(acc.id)}>Del</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STATEMENT TAB ── */}
      {activeTab === 1 && (
        <div>
          {accounts.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon"><Landmark size={32} color="#7c3aed" /></div><h3>No bank accounts</h3><p>Add a bank account in the Accounts tab first.</p><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setActiveTab(0)}>Add Account</button></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text1)', fontSize: 14, fontWeight: 600 }}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => setShowTxForm(!showTxForm)}>{showTxForm ? 'Cancel' : '+ Manual Entry'}</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total Transactions', value: transactions.length, color: 'var(--text1)' },
                  { label: 'Credits (In)', value: fmt(totalCredits), color: '#16a34a' },
                  { label: 'Debits (Out)', value: fmt(totalDebits), color: '#dc2626' },
                  { label: 'Reconciled', value: `${reconciledTxs.length} / ${transactions.length}`, color: 'var(--brand)' },
                ].map((k) => (
                  <div key={k.label} className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* ── IMPORT FROM FILE ── */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={sLabel}>Import Bank Statement</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

                {!showImport ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    onClick={() => fileRef.current?.click()}
                    style={{ border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(124,58,237,0.04)' : 'var(--bg2)', transition: 'all 0.15s' }}
                  >
                    <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><FolderOpen size={32} color="#7c3aed" /></div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Drop your bank statement here or click to browse</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Supports Excel (.xlsx, .xls), CSV (.csv), and PDF (.pdf)</div>
                  </div>
                ) : (
                  <div>
                    {parseError && (
                      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
                        <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />{parseError}
                      </div>
                    )}

                    {parsedTxs.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>Found {parsedTxs.length} transactions — edit if needed, then import</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary" onClick={importTransactions} disabled={importing || !selectedAccount}>
                              {importing ? 'Importing...' : `Import ${parsedTxs.length}`}
                            </button>
                            <button className="btn btn-secondary" onClick={() => { setShowImport(false); setParsedTxs([]); setPdfRawText(''); setParseError(''); }}>Cancel</button>
                          </div>
                        </div>
                        <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead style={{ background: 'var(--bg2)', position: 'sticky', top: 0 }}>
                              <tr>
                                {['Date', 'Description', 'Ref', 'Type', 'Amount', 'Balance', ''].map((h) => (
                                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {parsedTxs.map((tx, idx) => (
                                <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td style={{ padding: '5px 8px' }}>
                                    <input value={tx.date} onChange={(e) => setParsedTxs(prev => prev.map((t, i) => i === idx ? { ...t, date: e.target.value } : t))}
                                      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12, width: 100 }} />
                                  </td>
                                  <td style={{ padding: '5px 8px' }}>
                                    <input value={tx.description} onChange={(e) => setParsedTxs(prev => prev.map((t, i) => i === idx ? { ...t, description: e.target.value } : t))}
                                      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12, width: '100%', minWidth: 140 }} />
                                  </td>
                                  <td style={{ padding: '5px 8px' }}>
                                    <input value={tx.reference} onChange={(e) => setParsedTxs(prev => prev.map((t, i) => i === idx ? { ...t, reference: e.target.value } : t))}
                                      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12, width: 80 }} />
                                  </td>
                                  <td style={{ padding: '5px 8px' }}>
                                    <select value={tx.type} onChange={(e) => setParsedTxs(prev => prev.map((t, i) => i === idx ? { ...t, type: e.target.value as 'credit' | 'debit' } : t))}
                                      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', fontSize: 11 }}>
                                      <option value="credit">Credit</option>
                                      <option value="debit">Debit</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '5px 8px', fontWeight: 600, color: tx.type === 'credit' ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>
                                    {fmt(tx.amount)}
                                  </td>
                                  <td style={{ padding: '5px 8px', color: 'var(--text3)', fontSize: 11 }}>{tx.balance || '—'}</td>
                                  <td style={{ padding: '5px 6px' }}>
                                    <button onClick={() => setParsedTxs(prev => prev.filter((_, i) => i !== idx))}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}><X size={15} /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {pdfRawText && !parsedTxs.length && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text2)' }}>Extracted PDF text (for reference):</div>
                        <pre style={{ background: 'var(--bg2)', padding: 14, borderRadius: 8, fontSize: 11, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text2)', margin: '0 0 12px' }}>{pdfRawText}</pre>
                        <button className="btn btn-secondary" onClick={() => { setShowImport(false); setPdfRawText(''); setParseError(''); setShowTxForm(true); }}>Enter Manually Instead</button>
                      </div>
                    )}

                    {!parsedTxs.length && !pdfRawText && !parseError && (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 13 }}>Processing file...</div>
                    )}

                    {!parsedTxs.length && !pdfRawText && (
                      <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => { setShowImport(false); setParseError(''); }}>Back</button>
                    )}
                  </div>
                )}
              </div>

              {showTxForm && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={sLabel}>New Bank Statement Line</div>
                  <div className="form-grid">
                    <div className="form-group"><label>Date</label><input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} /></div>
                    <div className="form-group"><label>Type</label>
                      <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}>
                        <option value="credit">Credit (Money In)</option>
                        <option value="debit">Debit (Money Out)</option>
                      </select>
                    </div>
                    <div className="form-group"><label>Amount (Rs.) *</label><input type="number" min="0" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.00" /></div>
                    <div className="form-group"><label>Running Balance</label><input type="number" value={txForm.balance} onChange={(e) => setTxForm({ ...txForm, balance: e.target.value })} placeholder="Optional" /></div>
                    <div className="form-group full"><label>Description *</label><input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="e.g. Customer payment received" /></div>
                    <div className="form-group"><label>Bank Reference</label><input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} placeholder="e.g. TRN123456" /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={saveTransaction} disabled={savingTx}>{savingTx ? 'Saving...' : 'Add Transaction'}</button>
                    <button className="btn btn-secondary" onClick={() => setShowTxForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="table-wrap">
                <div className="table-toolbar"><h3>Bank Statement — {account?.name}</h3></div>
                {transactions.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon"><ClipboardList size={32} color="#7c3aed" /></div><h3>No transactions</h3><p>Upload a bank statement or add lines manually</p></div>
                ) : (
                  <table>
                    <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th style={{ textAlign: 'right' }}>Credit (In)</th><th style={{ textAlign: 'right' }}>Debit (Out)</th><th style={{ textAlign: 'right' }}>Balance</th><th>Status</th><th></th></tr></thead>
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
                              {tx.is_reconciled ? <><Check size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />Matched</> : 'Unmatched'}
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
            <div className="empty-state"><div className="empty-state-icon"><Landmark size={32} color="#7c3aed" /></div><h3>No bank accounts</h3><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setActiveTab(0)}>Add Account</button></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text1)', fontSize: 14, fontWeight: 600 }}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {(selectedBankTx || selectedBookEntry) && <button className="btn btn-secondary" onClick={() => { setSelectedBankTx(null); setSelectedBookEntry(null); }}>Clear Selection</button>}
              </div>

              {/* Difference banner */}
              {selectedBankTx && selectedBookEntry && (() => {
                const bankTx = unreconciledTxs.find(t => t.id === selectedBankTx);
                const bookE = activeBookEntries.find(e => e.id === selectedBookEntry);
                const bankAmt = bankTx ? (bankTx.credit || bankTx.debit) : 0;
                const bookAmt = bookE ? bookE.amount : 0;
                const diff = Math.abs(bankAmt - bookAmt);
                const match = diff < 0.01;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '12px 20px', borderRadius: 10, marginBottom: 16, background: match ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.07)', border: `1.5px solid ${match ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}` }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2, textTransform: 'uppercase' }}>Bank</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(bankAmt)}</div>
                    </div>
                    <div style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center' }}><ArrowLeftRight size={18} /></div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2, textTransform: 'uppercase' }}>Book</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(bookAmt)}</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      {match ? (
                        <span style={{ fontWeight: 700, color: '#16a34a', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> Amounts match</span>
                      ) : (
                        <span style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>Difference: {fmt(diff)}</span>
                      )}
                    </div>
                    <button className="btn btn-primary" onClick={reconcile} style={{ flexShrink: 0 }}>Confirm Match</button>
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Bank Transactions */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Bank Statement <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({unreconciledTxs.length} unmatched)</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Click to select</div>
                  </div>
                  <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                    {unreconciledTxs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>All transactions reconciled!</div>
                    ) : unreconciledTxs.map((tx) => (
                      <div key={tx.id} onClick={() => setSelectedBankTx(selectedBankTx === tx.id ? null : tx.id)}
                        style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedBankTx === tx.id ? 'rgba(124,58,237,0.08)' : 'var(--bg)', borderLeft: selectedBankTx === tx.id ? '3px solid var(--brand)' : '3px solid transparent' }}>
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

                {/* Book Entries */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Book Entries</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {(['erp', 'journal'] as const).map((src) => (
                        <button key={src} onClick={() => { setBookSource(src); setSelectedBookEntry(null); }}
                          style={{ padding: '4px 12px', borderRadius: 20, border: '1.5px solid', fontSize: 11, fontWeight: bookSource === src ? 700 : 500, cursor: 'pointer', background: bookSource === src ? 'var(--brand)' : 'transparent', color: bookSource === src ? '#fff' : 'var(--text2)', borderColor: bookSource === src ? 'var(--brand)' : 'var(--border)' }}>
                          {src === 'erp' ? 'Receipts / Payments' : 'Journal Entries (CoA)'}
                        </button>
                      ))}
                    </div>
                    {bookSource === 'journal' && (
                      <select value={selectedCoaId} onChange={(e) => setSelectedCoaId(e.target.value)}
                        style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text1)', fontSize: 13 }}>
                        <option value="">— Select CoA Account —</option>
                        {coaAccounts.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name} ({c.type})</option>)}
                      </select>
                    )}
                  </div>
                  <div style={{ maxHeight: bookSource === 'journal' ? 420 : 480, overflowY: 'auto' }}>
                    {activeBookEntries.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>
                        {bookSource === 'journal' ? (selectedCoaId ? 'No journal entries for this account.' : 'Select a CoA account above.') : 'No book entries found.'}
                      </div>
                    ) : activeBookEntries.map((e) => {
                      const typeColors: Record<string, { color: string; bg: string; label: string }> = {
                        receipt: { color: '#16a34a', bg: 'rgba(34,197,94,0.08)', label: 'Receipt' },
                        payment: { color: '#dc2626', bg: 'rgba(239,68,68,0.08)', label: 'Payment' },
                        expense: { color: '#d97706', bg: 'rgba(245,158,11,0.08)', label: 'Expense' },
                        journal: { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: e.isDebit ? 'JE Dr' : 'JE Cr' },
                      };
                      const tc = typeColors[e.type];
                      return (
                        <div key={e.id} onClick={() => setSelectedBookEntry(selectedBookEntry === e.id ? null : e.id)}
                          style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedBookEntry === e.id ? 'rgba(124,58,237,0.08)' : 'var(--bg)', borderLeft: selectedBookEntry === e.id ? '3px solid var(--brand)' : '3px solid transparent' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <div style={{ flex: 1, paddingRight: 8 }}>
                              <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color, marginRight: 6 }}>{tc.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.description}</span>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: e.isDebit ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                              {e.isDebit ? '-' : '+'}{fmt(e.amount)}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.date} · {e.reference}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {reconciledTxs.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 24 }}>
                  <div className="table-toolbar"><h3>Reconciled ({reconciledTxs.length})</h3></div>
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

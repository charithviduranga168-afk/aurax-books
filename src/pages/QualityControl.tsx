import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface QCInspection {
  id: string;
  inspection_number: string;
  grn_id: string | null;
  grn_number?: string;
  product_id: string | null;
  product_name: string;
  supplier_name: string;
  quantity_received: number;
  quantity_passed: number;
  quantity_failed: number;
  quantity_on_hold: number;
  inspection_date: string;
  inspector: string;
  status: string;
  failure_reason: string;
  notes: string;
  created_at: string;
}

interface GRNHeader {
  id: string;
  grn_number: string;
  supplier_name: string;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

const STATUSES = ['pending', 'passed', 'failed', 'partial', 'on_hold'];
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#fef9c3', color: '#a16207' },
  passed:   { bg: '#dcfce7', color: '#16a34a' },
  failed:   { bg: '#fee2e2', color: '#dc2626' },
  partial:  { bg: '#fef3c7', color: '#d97706' },
  on_hold:  { bg: '#e0e7ff', color: '#4f46e5' },
};

const FAILURE_REASONS = [
  'Damaged packaging', 'Wrong quantity', 'Wrong product', 'Quality below spec',
  'Expired / near expiry', 'Physical damage', 'Wrong specifications', 'Other',
];

export default function QualityControl() {
  const [inspections, setInspections] = useState<QCInspection[]>([]);
  const [grns, setGRNs] = useState<GRNHeader[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dialog, setDialog] = useState<{ type: 'alert' | 'confirm'; msg: string; onOk?: () => void } | null>(null);

  const blankForm = {
    grn_id: '', product_id: '', product_name: '', supplier_name: '',
    quantity_received: '', quantity_passed: '', quantity_failed: '0', quantity_on_hold: '0',
    inspection_date: new Date().toISOString().split('T')[0],
    inspector: '', status: 'pending', failure_reason: '', notes: '',
  };
  const [form, setForm] = useState<any>(blankForm);

  function showAlert(msg: string) { setDialog({ type: 'alert', msg }); }
  function showConfirm(msg: string, onOk: () => void) { setDialog({ type: 'confirm', msg, onOk }); }

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: ins }, { data: grnData }, { data: prodData }] = await Promise.all([
      supabase.from('qc_inspections').select('*').order('created_at', { ascending: false }),
      supabase.from('grn_headers').select('id, grn_number, supplier_name, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('products').select('id, name, sku').order('name'),
    ]);
    setInspections(ins || []);
    setGRNs(grnData || []);
    setProducts(prodData || []);
    setLoading(false);
  }

  async function getNextNumber() {
    const { data } = await supabase.from('qc_inspections').select('inspection_number').order('created_at', { ascending: false }).limit(50);
    let max = 0;
    (data || []).forEach(r => {
      const m = r.inspection_number?.match(/(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1]));
    });
    return 'QC-' + String(max + 1).padStart(4, '0');
  }

  function onGRNChange(grnId: string) {
    const grn = grns.find(g => g.id === grnId);
    setForm((f: any) => ({ ...f, grn_id: grnId, supplier_name: grn?.supplier_name || f.supplier_name }));
  }

  function onProductChange(productId: string) {
    const prod = products.find(p => p.id === productId);
    setForm((f: any) => ({ ...f, product_id: productId, product_name: prod?.name || '' }));
  }

  function onQtyReceivedChange(val: string) {
    const qty = parseFloat(val) || 0;
    setForm((f: any) => ({ ...f, quantity_received: val, quantity_passed: String(qty), quantity_failed: '0', quantity_on_hold: '0' }));
  }

  function deriveStatus(f: any): string {
    const rec = parseFloat(f.quantity_received) || 0;
    const fail = parseFloat(f.quantity_failed) || 0;
    const hold = parseFloat(f.quantity_on_hold) || 0;
    const pass = parseFloat(f.quantity_passed) || 0;
    if (rec === 0) return 'pending';
    if (fail === rec) return 'failed';
    if (pass === rec) return 'passed';
    if (hold > 0 && pass === 0 && fail === 0) return 'on_hold';
    return 'partial';
  }

  async function save() {
    if (!form.product_name.trim()) { showAlert('Product name is required.'); return; }
    const qty = parseFloat(form.quantity_received);
    if (!qty || qty <= 0) { showAlert('Quantity received must be greater than 0.'); return; }

    const passed = parseFloat(form.quantity_passed) || 0;
    const failed = parseFloat(form.quantity_failed) || 0;
    const onHold = parseFloat(form.quantity_on_hold) || 0;
    if (passed + failed + onHold > qty) { showAlert('Passed + Failed + On Hold cannot exceed Quantity Received.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); showAlert('Session expired. Please refresh.'); return; }

    const status = form.status !== 'pending' ? form.status : deriveStatus(form);
    const payload = {
      grn_id: form.grn_id || null,
      product_id: form.product_id || null,
      product_name: form.product_name.trim(),
      supplier_name: form.supplier_name.trim(),
      quantity_received: qty,
      quantity_passed: passed,
      quantity_failed: failed,
      quantity_on_hold: onHold,
      inspection_date: form.inspection_date,
      inspector: form.inspector.trim(),
      status,
      failure_reason: form.failure_reason,
      notes: form.notes.trim(),
      user_id: user.id,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from('qc_inspections').update(payload).eq('id', editId));
    } else {
      const inspection_number = await getNextNumber();
      ({ error } = await supabase.from('qc_inspections').insert({ ...payload, inspection_number }));
    }
    setSaving(false);
    setShowForm(false);
    if (error) {
      console.error('QC save error:', error);
      showAlert('Failed to save: ' + error.message);
      return;
    }
    loadAll();
  }

  function openEdit(ins: QCInspection) {
    setEditId(ins.id);
    setForm({
      grn_id: ins.grn_id || '',
      product_id: ins.product_id || '',
      product_name: ins.product_name,
      supplier_name: ins.supplier_name,
      quantity_received: String(ins.quantity_received),
      quantity_passed: String(ins.quantity_passed),
      quantity_failed: String(ins.quantity_failed),
      quantity_on_hold: String(ins.quantity_on_hold),
      inspection_date: ins.inspection_date,
      inspector: ins.inspector,
      status: ins.status,
      failure_reason: ins.failure_reason,
      notes: ins.notes,
    });
    setShowForm(true);
  }

  function deleteInspection(id: string) {
    showConfirm('Delete this inspection record?', async () => {
      await supabase.from('qc_inspections').delete().eq('id', id);
      loadAll();
    });
  }

  const filtered = inspections.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.product_name.toLowerCase().includes(q) || i.inspection_number.toLowerCase().includes(q) || i.supplier_name.toLowerCase().includes(q) || i.inspector.toLowerCase().includes(q);
    const matchStatus = !filterStatus || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPassed = inspections.reduce((s, i) => s + i.quantity_passed, 0);
  const totalFailed = inspections.reduce((s, i) => s + i.quantity_failed, 0);
  const totalReceived = inspections.reduce((s, i) => s + i.quantity_received, 0);
  const passRate = totalReceived > 0 ? ((totalPassed / totalReceived) * 100).toFixed(1) : '0.0';

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quality Control</h1>
          <p className="page-subtitle">Inspect received goods and track pass/fail outcomes</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditId(null); setForm(blankForm); setShowForm(true); }}>+ New Inspection</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Inspections', value: inspections.length, color: 'var(--brand)' },
          { label: 'Items Received', value: totalReceived.toLocaleString(), color: '#0284c7' },
          { label: 'Items Passed', value: totalPassed.toLocaleString(), color: '#16a34a' },
          { label: 'Items Failed', value: totalFailed.toLocaleString(), color: '#dc2626' },
          { label: 'Pass Rate', value: passRate + '%', color: parseFloat(passRate) >= 90 ? '#16a34a' : parseFloat(passRate) >= 70 ? '#d97706' : '#dc2626' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 22px', minWidth: 130 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {['Inspections', 'By Product', 'By Supplier'].map((t, i) => (
          <button key={t} className={`tab-btn ${activeTab === i ? 'active' : ''}`} onClick={() => setActiveTab(i)}>{t}</button>
        ))}
      </div>

      {activeTab === 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input className="form-input" style={{ flex: 1, minWidth: 220 }} placeholder="Search product, number, supplier..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input" style={{ width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>

          <div className="table-wrap">
            <div className="table-toolbar"><h3>Inspections ({filtered.length})</h3></div>
            {loading ? <div className="empty-state">Loading...</div> : filtered.length === 0 ? (
              <div className="empty-state">No inspections found.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Number</th><th>Date</th><th>Product</th><th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Received</th>
                    <th style={{ textAlign: 'right' }}>Passed</th>
                    <th style={{ textAlign: 'right' }}>Failed</th>
                    <th>Inspector</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(ins => {
                    const sc = STATUS_COLORS[ins.status] || STATUS_COLORS.pending;
                    return (
                      <tr key={ins.id}>
                        <td style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 13 }}>{ins.inspection_number}</td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{ins.inspection_date}</td>
                        <td style={{ fontWeight: 600 }}>{ins.product_name}</td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{ins.supplier_name || '—'}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }}>{ins.quantity_received}</td>
                        <td style={{ textAlign: 'right', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>{ins.quantity_passed}</td>
                        <td style={{ textAlign: 'right', fontSize: 13, color: ins.quantity_failed > 0 ? '#dc2626' : 'var(--text2)', fontWeight: ins.quantity_failed > 0 ? 700 : 400 }}>{ins.quantity_failed}</td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{ins.inspector || '—'}</td>
                        <td>
                          <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
                            {ins.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(ins)}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteInspection(ins.id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 1 && (
        <div className="table-wrap">
          <div className="table-toolbar"><h3>Pass/Fail by Product</h3></div>
          {loading ? <div className="empty-state">Loading...</div> : (() => {
            const byProduct: Record<string, { name: string; received: number; passed: number; failed: number }> = {};
            inspections.forEach(i => {
              if (!byProduct[i.product_name]) byProduct[i.product_name] = { name: i.product_name, received: 0, passed: 0, failed: 0 };
              byProduct[i.product_name].received += i.quantity_received;
              byProduct[i.product_name].passed += i.quantity_passed;
              byProduct[i.product_name].failed += i.quantity_failed;
            });
            const rows = Object.values(byProduct).sort((a, b) => b.received - a.received);
            return rows.length === 0 ? <div className="empty-state">No data.</div> : (
              <table>
                <thead>
                  <tr><th>Product</th><th style={{ textAlign: 'right' }}>Received</th><th style={{ textAlign: 'right' }}>Passed</th><th style={{ textAlign: 'right' }}>Failed</th><th style={{ textAlign: 'right' }}>Pass Rate</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const rate = r.received > 0 ? ((r.passed / r.received) * 100).toFixed(1) : '0.0';
                    const rateNum = parseFloat(rate);
                    return (
                      <tr key={r.name}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ textAlign: 'right' }}>{r.received}</td>
                        <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{r.passed}</td>
                        <td style={{ textAlign: 'right', color: r.failed > 0 ? '#dc2626' : 'var(--text2)', fontWeight: r.failed > 0 ? 700 : 400 }}>{r.failed}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: rateNum >= 90 ? '#16a34a' : rateNum >= 70 ? '#d97706' : '#dc2626' }}>{rate}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {activeTab === 2 && (
        <div className="table-wrap">
          <div className="table-toolbar"><h3>Pass/Fail by Supplier</h3></div>
          {loading ? <div className="empty-state">Loading...</div> : (() => {
            const bySupplier: Record<string, { name: string; received: number; passed: number; failed: number; count: number }> = {};
            inspections.forEach(i => {
              const k = i.supplier_name || 'Unknown';
              if (!bySupplier[k]) bySupplier[k] = { name: k, received: 0, passed: 0, failed: 0, count: 0 };
              bySupplier[k].received += i.quantity_received;
              bySupplier[k].passed += i.quantity_passed;
              bySupplier[k].failed += i.quantity_failed;
              bySupplier[k].count++;
            });
            const rows = Object.values(bySupplier).sort((a, b) => b.received - a.received);
            return rows.length === 0 ? <div className="empty-state">No data.</div> : (
              <table>
                <thead>
                  <tr><th>Supplier</th><th style={{ textAlign: 'right' }}>Inspections</th><th style={{ textAlign: 'right' }}>Received</th><th style={{ textAlign: 'right' }}>Passed</th><th style={{ textAlign: 'right' }}>Failed</th><th style={{ textAlign: 'right' }}>Pass Rate</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const rate = r.received > 0 ? ((r.passed / r.received) * 100).toFixed(1) : '0.0';
                    const rateNum = parseFloat(rate);
                    return (
                      <tr key={r.name}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{r.count}</td>
                        <td style={{ textAlign: 'right' }}>{r.received}</td>
                        <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{r.passed}</td>
                        <td style={{ textAlign: 'right', color: r.failed > 0 ? '#dc2626' : 'var(--text2)', fontWeight: r.failed > 0 ? 700 : 400 }}>{r.failed}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: rateNum >= 90 ? '#16a34a' : rateNum >= 70 ? '#d97706' : '#dc2626' }}>{rate}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {dialog && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <p style={{ margin: '0 0 20px', lineHeight: 1.5 }}>{dialog.msg}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {dialog.type === 'confirm' && <button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>}
              <button className="btn btn-primary" onClick={() => { dialog.onOk?.(); setDialog(null); }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{editId ? 'Edit Inspection' : 'New Inspection'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Link to GRN</label>
                <select className="form-input" value={form.grn_id} onChange={e => onGRNChange(e.target.value)}>
                  <option value="">— Manual Entry —</option>
                  {grns.map(g => <option key={g.id} value={g.id}>{g.grn_number} — {g.supplier_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Inspection Date *</label>
                <input className="form-input" type="date" value={form.inspection_date} onChange={e => setForm((f: any) => ({ ...f, inspection_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Product *</label>
                <select className="form-input" value={form.product_id} onChange={e => onProductChange(e.target.value)}>
                  <option value="">— Select Product —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Product Name (override)</label>
                <input className="form-input" value={form.product_name} onChange={e => setForm((f: any) => ({ ...f, product_name: e.target.value }))} placeholder="Or type product name" />
              </div>
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <input className="form-input" value={form.supplier_name} onChange={e => setForm((f: any) => ({ ...f, supplier_name: e.target.value }))} placeholder="Supplier name" />
              </div>
              <div className="form-group">
                <label className="form-label">Inspector</label>
                <input className="form-input" value={form.inspector} onChange={e => setForm((f: any) => ({ ...f, inspector: e.target.value }))} placeholder="Inspector name" />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity Received *</label>
                <input className="form-input" type="number" min="0" value={form.quantity_received} onChange={e => onQtyReceivedChange(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity Passed</label>
                <input className="form-input" type="number" min="0" value={form.quantity_passed} onChange={e => setForm((f: any) => ({ ...f, quantity_passed: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity Failed</label>
                <input className="form-input" type="number" min="0" value={form.quantity_failed} onChange={e => setForm((f: any) => ({ ...f, quantity_failed: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity On Hold</label>
                <input className="form-input" type="number" min="0" value={form.quantity_on_hold} onChange={e => setForm((f: any) => ({ ...f, quantity_on_hold: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Failure Reason</label>
                <select className="form-input" value={form.failure_reason} onChange={e => setForm((f: any) => ({ ...f, failure_reason: e.target.value }))}>
                  <option value="">— None —</option>
                  {FAILURE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="Additional inspection notes..." style={{ resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Inspection'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

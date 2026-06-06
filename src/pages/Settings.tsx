import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    address: '',
    phone: '',
    email: '',
    tax_reg: '',
    tax_rate: '0',
    invoice_prefix: 'INV-',
    bill_prefix: 'BILL-',
    receipt_prefix: 'REC-',
    payment_prefix: 'PAY-',
    grn_prefix: 'GRN-',
    costing_method: 'FIFO',
  });
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (data) {
      setSettingsId(data.id);
      setForm({
        company_name: data.company_name || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        tax_reg: data.tax_reg || '',
        tax_rate: String(data.tax_rate || 0),
        invoice_prefix: data.invoice_prefix || 'INV-',
        bill_prefix: data.bill_prefix || 'BILL-',
        receipt_prefix: data.receipt_prefix || 'REC-',
        payment_prefix: data.payment_prefix || 'PAY-',
        grn_prefix: data.grn_prefix || 'GRN-',
        costing_method: data.costing_method || 'FIFO',
      });
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      user_id: user.id,
      company_name: form.company_name,
      address: form.address,
      phone: form.phone,
      email: form.email,
      tax_reg: form.tax_reg,
      tax_rate: parseFloat(form.tax_rate) || 0,
      invoice_prefix: form.invoice_prefix,
      bill_prefix: form.bill_prefix,
      receipt_prefix: form.receipt_prefix,
      payment_prefix: form.payment_prefix,
      grn_prefix: form.grn_prefix,
      costing_method: form.costing_method,
    };

    if (settingsId) {
      await supabase
        .from('company_settings')
        .update(payload)
        .eq('id', settingsId);
    } else {
      const { data } = await supabase
        .from('company_settings')
        .insert(payload)
        .select()
        .single();
      if (data) setSettingsId(data.id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading)
    return (
      <div className="empty-state">
        <p>Loading...</p>
      </div>
    );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">
            Configure your company details and preferences
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: '20px', maxWidth: '800px' }}>
        {/* Company Info */}
        <div className="card">
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--brand)',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Company Information
          </div>
          <div className="form-grid">
            <div className="form-group full">
              <label>Business Name *</label>
              <input
                value={form.company_name}
                onChange={(e) =>
                  setForm({ ...form, company_name: e.target.value })
                }
                placeholder="e.g. ABC Trading (Pvt) Ltd"
              />
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text3)',
                  marginTop: '3px',
                }}
              >
                This appears on all invoices and PDF exports
              </span>
            </div>
            <div className="form-group full">
              <label>Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Main Street, Colombo 03, Sri Lanka"
                rows={2}
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+94 11 234 5678"
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="info@yourcompany.lk"
              />
            </div>
            <div className="form-group">
              <label>Tax Registration No. (VAT)</label>
              <input
                value={form.tax_reg}
                onChange={(e) => setForm({ ...form, tax_reg: e.target.value })}
                placeholder="e.g. 123456789-7000"
              />
            </div>
            <div className="form-group">
              <label>Default Tax Rate (%)</label>
              <input
                type="number"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Numbering */}
        <div className="card">
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--brand)',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Document Numbering Prefixes
          </div>
          <div className="form-grid cols-3">
            <div className="form-group">
              <label>Invoice Prefix</label>
              <input
                value={form.invoice_prefix}
                onChange={(e) =>
                  setForm({ ...form, invoice_prefix: e.target.value })
                }
                placeholder="INV-"
              />
            </div>
            <div className="form-group">
              <label>Bill Prefix</label>
              <input
                value={form.bill_prefix}
                onChange={(e) =>
                  setForm({ ...form, bill_prefix: e.target.value })
                }
                placeholder="BILL-"
              />
            </div>
            <div className="form-group">
              <label>Receipt Prefix</label>
              <input
                value={form.receipt_prefix}
                onChange={(e) =>
                  setForm({ ...form, receipt_prefix: e.target.value })
                }
                placeholder="REC-"
              />
            </div>
            <div className="form-group">
              <label>Payment Prefix</label>
              <input
                value={form.payment_prefix}
                onChange={(e) =>
                  setForm({ ...form, payment_prefix: e.target.value })
                }
                placeholder="PAY-"
              />
            </div>
            <div className="form-group">
              <label>GRN Prefix</label>
              <input
                value={form.grn_prefix}
                onChange={(e) =>
                  setForm({ ...form, grn_prefix: e.target.value })
                }
                placeholder="GRN-"
              />
            </div>
          </div>
        </div>

        {/* Inventory Costing */}
        <div className="card">
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--brand)',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Inventory Costing
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Costing Method</label>
              <select
                value={form.costing_method}
                onChange={(e) =>
                  setForm({ ...form, costing_method: e.target.value })
                }
              >
                <option value="FIFO">FIFO (First In, First Out) — Standard</option>
                <option value="LIFO">LIFO (Last In, First Out)</option>
                <option value="AVG">Average Cost</option>
              </select>
            </div>
            <div className="form-group full">
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text3)',
                  lineHeight: 1.6,
                }}
              >
                This determines how Aurax Books values your stock and computes each
                product's Cost Price. It feeds directly into BOM costs, production
                order costs, and the Cost Price shown on every product. Today, costs
                are computed using a running Weighted Average (the basis for AVG, and
                the working approximation used for FIFO/LIFO until full purchase-layer
                tracking is enabled). The Cost Price on the Products page updates
                automatically — every Goods Received Note and completed Production
                Order recalculates it for you.
              </span>
            </div>
          </div>
        </div>

        {/* Account info */}
        <div className="card">
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--brand)',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Account
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Sign Out</div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text2)',
                  marginTop: '2px',
                }}
              >
                Sign out of Aurax Books
              </div>
            </div>
            <button
              className="btn btn-danger"
              onClick={() => supabase.auth.signOut()}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

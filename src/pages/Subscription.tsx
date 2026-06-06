import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import md5 from 'md5';

const BASE_PRICE = 2000;
const PER_USER_PRICE = 1000;
const AURAX_PAYHERE_MERCHANT = '1233250';
const AURAX_PAYHERE_SECRET = 'MTIzNDU0OTgxNDMyNzE1OTQ2NTMzMTIzMTI2MDczMTA3MzAxNTM5Ng==';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface Payment {
  id: string;
  amount: number;
  users_count: number;
  period: string;
  payment_method: string;
  payment_ref: string | null;
  status: string;
  created_at: string;
}

const TABS = ['Overview', 'Team Members', 'Billing History'];

export default function Subscription() {
  const [activeTab, setActiveTab] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  // New member form
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', email: '', role: 'Staff' });
  const [savingMember, setSavingMember] = useState(false);

  // Dialog
  const [dialog, setDialog] = useState<{ type: 'alert' | 'confirm'; msg: string; onOk?: () => void } | null>(null);
  const showAlert = (msg: string) => setDialog({ type: 'alert', msg });
  const showConfirm = (msg: string, onOk: () => void) => setDialog({ type: 'confirm', msg, onOk });

  const totalUsers = 1 + members.filter((m) => m.is_active).length;
  const monthlyTotal = BASE_PRICE + (totalUsers - 1) * PER_USER_PRICE;
  const currentPeriod = new Date().toLocaleDateString('en-LK', { month: 'long', year: 'numeric' });

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    setUser(u);
    await Promise.all([loadMembers(u.id), loadPayments(u.id)]);
    setLoading(false);
  }

  async function loadMembers(uid: string) {
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('admin_user_id', uid)
      .order('created_at');
    setMembers(data || []);
  }

  async function loadPayments(uid: string) {
    const { data } = await supabase
      .from('subscription_payments')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setPayments(data || []);
  }

  async function saveMember() {
    if (!memberForm.name.trim() || !memberForm.email.trim()) {
      showAlert('Name and email are required.');
      return;
    }
    setSavingMember(true);
    const { error } = await supabase.from('team_members').insert({
      admin_user_id: user.id,
      name: memberForm.name.trim(),
      email: memberForm.email.trim(),
      role: memberForm.role,
    });
    if (error) { showAlert('Failed to add member: ' + error.message); setSavingMember(false); return; }
    setMemberForm({ name: '', email: '', role: 'Staff' });
    setShowMemberForm(false);
    setSavingMember(false);
    await loadMembers(user.id);
  }

  async function toggleMember(m: Member) {
    await supabase.from('team_members').update({ is_active: !m.is_active }).eq('id', m.id);
    await loadMembers(user.id);
  }

  async function deleteMember(m: Member) {
    showConfirm(`Remove ${m.name} from your team?`, async () => {
      await supabase.from('team_members').delete().eq('id', m.id);
      await loadMembers(user.id);
    });
  }

  function payViaPayHere() {
    const orderId = `AURAX-SUB-${user.id.slice(0, 8)}-${Date.now()}`;
    const amount = monthlyTotal.toFixed(2);
    const currency = 'LKR';

    // Record pending payment
    supabase.from('subscription_payments').insert({
      user_id: user.id,
      amount: monthlyTotal,
      users_count: totalUsers,
      period: currentPeriod,
      payment_method: 'PayHere',
      payment_ref: orderId,
      status: 'Pending',
    });

    // PayHere hash: MD5(merchant_id + order_id + amount + currency + MD5(secret).toUpperCase()).toUpperCase()
    const secretHash = md5(AURAX_PAYHERE_SECRET).toUpperCase();
    const hash = md5(AURAX_PAYHERE_MERCHANT + orderId + amount + currency + secretHash).toUpperCase();

    const fields: Record<string, string> = {
      merchant_id: AURAX_PAYHERE_MERCHANT,
      return_url: window.location.origin,
      cancel_url: window.location.origin,
      notify_url: '',
      order_id: orderId,
      items: `Aurax Books Subscription — ${currentPeriod} (${totalUsers} user${totalUsers > 1 ? 's' : ''})`,
      currency,
      amount,
      first_name: (user.email || '').split('@')[0],
      last_name: '',
      email: user.email || '',
      phone: '0000000000',
      address: 'Sri Lanka',
      city: 'Colombo',
      country: 'Sri Lanka',
      hash,
    };

    // Navigate current tab to PayHere (avoids popup blocker on programmatic form submit)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.payhere.lk/pay/checkout';
    form.style.display = 'none';

    for (const [k, v] of Object.entries(fields)) {
      const inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = k;
      inp.value = v;
      form.appendChild(inp);
    }

    document.body.appendChild(form);
    form.submit();
  }


  const tabStyle = (i: number) => ({
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: activeTab === i ? 700 : 500,
    background: activeTab === i ? 'var(--brand)' : 'transparent',
    color: activeTab === i ? '#fff' : 'var(--text2)',
    transition: 'all 0.15s',
  });

  const sectionLabel = {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--brand)',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  };

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      {/* Dialog */}
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: '28px 24px' }}>
            <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6 }}>{dialog.msg}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {dialog.type === 'confirm' && (
                <button className="btn btn-danger" onClick={() => { dialog.onOk?.(); setDialog(null); }}>Confirm</button>
              )}
              <button className="btn btn-secondary" onClick={() => setDialog(null)}>
                {dialog.type === 'alert' ? 'OK' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Subscription & Team</div>
          <div className="page-sub">Manage your Aurax Books plan and team members</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--bg2)', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
        {TABS.map((t, i) => (
          <button key={t} style={tabStyle(i)} onClick={() => setActiveTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 0 && (
        <div style={{ display: 'grid', gap: '20px', maxWidth: '900px' }}>
          {/* Plan summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Plan</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand)' }}>Professional</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>Monthly billing</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Team Size</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand)' }}>{totalUsers}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>
                Admin + {totalUsers - 1} member{totalUsers - 1 !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Monthly Total</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand)' }}>Rs. {monthlyTotal.toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>{currentPeriod}</div>
            </div>
          </div>

          {/* Pricing breakdown */}
          <div className="card">
            <div style={sectionLabel}>Pricing Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: 'var(--text3)', fontWeight: 600 }}>Description</th>
                  <th style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text3)', fontWeight: 600 }}>Users</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text3)', fontWeight: 600 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 0' }}>Admin User (base plan)</td>
                  <td style={{ textAlign: 'center', padding: '10px 0' }}>1</td>
                  <td style={{ textAlign: 'right', padding: '10px 0' }}>Rs. {BASE_PRICE.toLocaleString()}</td>
                </tr>
                {totalUsers > 1 && (
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0' }}>Additional Team Members × {totalUsers - 1}</td>
                    <td style={{ textAlign: 'center', padding: '10px 0' }}>{totalUsers - 1}</td>
                    <td style={{ textAlign: 'right', padding: '10px 0' }}>Rs. {((totalUsers - 1) * PER_USER_PRICE).toLocaleString()}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '10px 0', fontWeight: 700 }}>Total Monthly</td>
                  <td style={{ textAlign: 'center', padding: '10px 0', fontWeight: 700 }}>{totalUsers}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0', fontWeight: 700, color: 'var(--brand)', fontSize: '15px' }}>
                    Rs. {monthlyTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pay now */}
          <div className="card">
            <div style={sectionLabel}>Pay Subscription — {currentPeriod}</div>
            <p style={{ fontSize: '13px', color: 'var(--text2)', margin: '0 0 20px' }}>
              Choose your preferred payment method to pay <strong>Rs. {monthlyTotal.toLocaleString()}</strong> for {currentPeriod}.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={payViaPayHere}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
                title="Pay via PayHere"
              >
                <img
                  src="https://www.payhere.lk/downloads/images/payhere_short_banner.png"
                  alt="PayHere"
                  width="250"
                  style={{ display: 'block', borderRadius: '6px' }}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TEAM MEMBERS ── */}
      {activeTab === 1 && (
        <div style={{ maxWidth: '800px' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={sectionLabel}>Team Members</div>
              <button className="btn btn-primary" onClick={() => setShowMemberForm(!showMemberForm)}>
                {showMemberForm ? 'Cancel' : '+ Add Member'}
              </button>
            </div>

            {/* Billing note */}
            <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--brand)', fontWeight: 600, marginBottom: '4px' }}>
                Billing: Rs. {BASE_PRICE.toLocaleString()} (admin) + Rs. {PER_USER_PRICE.toLocaleString()} × {members.filter(m => m.is_active).length} active member{members.filter(m => m.is_active).length !== 1 ? 's' : ''} = <strong>Rs. {monthlyTotal.toLocaleString()}/month</strong>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                Deactivating a member removes them from billing immediately. Deleting removes them permanently.
              </div>
            </div>

            {/* Add form */}
            {showMemberForm && (
              <div style={{ background: 'var(--bg2)', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>New Team Member</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      value={memberForm.name}
                      onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                      placeholder="e.g. Kamal Perera"
                    />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      value={memberForm.email}
                      onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                      placeholder="kamal@yourcompany.lk"
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select
                      value={memberForm.role}
                      onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                    >
                      <option value="Staff">Staff</option>
                      <option value="Manager">Manager</option>
                      <option value="Accountant">Accountant</option>
                      <option value="Viewer">Viewer (Read-only)</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button className="btn btn-primary" onClick={saveMember} disabled={savingMember}>
                    {savingMember ? 'Adding...' : 'Add Member'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowMemberForm(false)}>Cancel</button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '10px 0 0' }}>
                  Adding this member will increase your monthly bill by Rs. {PER_USER_PRICE.toLocaleString()}.
                </p>
              </div>
            )}

            {/* Admin row */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
                {(user?.email || 'A').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{user?.email}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Admin • Rs. 2,000/month base</div>
              </div>
              <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>Owner</span>
            </div>

            {/* Member rows */}
            {members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: '13px' }}>
                No team members yet. Add members to collaborate on Aurax Books.
              </div>
            ) : (
              members.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.is_active ? 'var(--brand)' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, flexShrink: 0, opacity: m.is_active ? 1 : 0.5 }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: m.is_active ? 'var(--text1)' : 'var(--text3)' }}>{m.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{m.email} • {m.role} • Rs. {PER_USER_PRICE.toLocaleString()}/month</div>
                  </div>
                  <span style={{
                    padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                    background: m.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(0,0,0,0.05)',
                    color: m.is_active ? '#16a34a' : 'var(--text3)',
                  }}>
                    {m.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 12px' }}
                    onClick={() => toggleMember(m)}
                  >
                    {m.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => deleteMember(m)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── BILLING HISTORY ── */}
      {activeTab === 2 && (
        <div style={{ maxWidth: '800px' }}>
          <div className="card">
            <div style={sectionLabel}>Payment History</div>
            {payments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: '13px' }}>
                No payments recorded yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Period', 'Method', 'Users', 'Amount', 'Reference', 'Status', 'Date'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px' }}>{p.period}</td>
                      <td style={{ padding: '10px 8px' }}>{p.payment_method}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>{p.users_count}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>Rs. {p.amount.toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace' }}>{p.payment_ref || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                          background: p.status === 'Paid' ? 'rgba(34,197,94,0.1)' : p.status === 'Pending' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                          color: p.status === 'Paid' ? '#16a34a' : p.status === 'Pending' ? '#d97706' : '#dc2626',
                        }}>{p.status}</span>
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '12px', color: 'var(--text2)' }}>
                        {new Date(p.created_at).toLocaleDateString('en-LK')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

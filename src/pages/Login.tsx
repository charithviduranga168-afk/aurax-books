import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../supabase';

// ── Module SVG icon paths (matches main sidebar icons) ────────────
const MODULE_ICON_PATHS: Record<string, string> = {
  'Sales':         'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  'Purchasing':    'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0',
  'Inventory':     'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  'Manufacturing': 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  'Accounting':    'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  'HR & Payroll':  'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  'Operations':    'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  'Point of Sale': 'M20 3H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2z M8 21h8 M12 17v4',
};

function ModIcon({ name, color, size = 14 }: { name: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={MODULE_ICON_PATHS[name] ?? MODULE_ICON_PATHS['Sales']} />
    </svg>
  );
}

// ── Mini ERP module data ──────────────────────────────────────────
const MODULES = [
  { name: 'Sales',         color: '#7c5cf6', iconBg: '#efe9fd', period: 'This Month',
    stat1: { label: 'Orders',       value: '1,428',   change: '+8.4%'  },
    stat2: { label: 'Revenue',      value: '$248,600', change: '+12.5%' },
    rows: [
      { l: 'Order #10428', s: 'Acme Corp',           r: '+$1,240',  g: true  },
      { l: 'Order #10427', s: 'Globex Ltd',           r: '+$865',    g: true  },
      { l: 'Order #10426', s: 'Initech',              r: '+$2,310',  g: true  },
    ]},
  { name: 'Purchasing',    color: '#2f6df6', iconBg: '#e7eefe', period: 'This Month',
    stat1: { label: 'Open POs',     value: '62',       change: '+4'     },
    stat2: { label: 'Spend MTD',    value: '$84,200',  change: '+9.1%'  },
    rows: [
      { l: 'PO-2287',      s: 'Globex · Raw steel',   r: '$6,400',   g: true  },
      { l: 'PO-2286',      s: 'Umbrella · Packaging',  r: '$1,980',   g: true  },
      { l: 'PO-2285',      s: 'Stark · Components',    r: '$12,750',  g: true  },
    ]},
  { name: 'Inventory',     color: '#16a34a', iconBg: '#e7f6ec', period: 'Live',
    stat1: { label: 'SKUs tracked', value: '1,284',   change: '+38'    },
    stat2: { label: 'Stock value',  value: '$512,800', change: '+6.2%'  },
    rows: [
      { l: 'Widget A',     s: 'Inbound · WH-1',        r: '+120',     g: true  },
      { l: 'Gadget B',     s: 'Picked · Order #10428', r: '−32',      g: false },
      { l: 'Module C',     s: 'Inbound · WH-2',        r: '+540',     g: true  },
    ]},
  { name: 'Manufacturing', color: '#e08a2b', iconBg: '#fdeede', period: 'Today',
    stat1: { label: 'Work orders',  value: '8',        change: '+2'     },
    stat2: { label: 'Units produced',value: '1,940',   change: '+15.0%' },
    rows: [
      { l: 'WO-553',       s: 'Assembly line 2',       r: '78%',      g: true  },
      { l: 'WO-552',       s: 'Paint shop',            r: '45%',      g: true  },
      { l: 'WO-551',       s: 'Packaging',             r: '92%',      g: true  },
    ]},
  { name: 'Accounting',   color: '#5b59f2', iconBg: '#e9e9fd', period: 'This Month',
    stat1: { label: 'Net profit',   value: '$164,350', change: '+18.7%' },
    stat2: { label: 'Cash balance', value: '$128,250', change: '+16.3%' },
    rows: [
      { l: 'JE-1187',     s: 'Sales revenue',          r: '$12,400 Cr', g: true  },
      { l: 'JE-1186',     s: 'Supplier payment',       r: '$6,400 Dr',  g: false },
      { l: 'JE-1185',     s: 'Payroll accrual',        r: '$22,800 Dr', g: false },
    ]},
  { name: 'HR & Payroll', color: '#ec5f8a', iconBg: '#fdeaf2', period: 'This Month',
    stat1: { label: 'Employees',    value: '214',      change: '+6'     },
    stat2: { label: 'Payroll MTD',  value: '$86,500',  change: '+3.4%'  },
    rows: [
      { l: 'June payroll', s: '214 employees',         r: 'Processed',  g: true  },
      { l: 'New hire',     s: 'A. Patel · Sales',      r: 'Onboarding', g: true  },
      { l: 'Leave request',s: 'M. Chen',               r: 'Approved',   g: true  },
    ]},
  { name: 'Operations',   color: '#0f9b8e', iconBg: '#d9f3f1', period: 'Today',
    stat1: { label: 'Tasks done',   value: '142',      change: '+24'    },
    stat2: { label: 'On-time rate', value: '99.4%',    change: '+0.3%'  },
    rows: [
      { l: 'Shipment #882',s: 'Route 4 · Dispatched', r: 'On time',    g: true  },
      { l: 'Task #4471',   s: 'QA check',             r: 'Done',       g: true  },
      { l: 'Delivery #771',s: 'Route 2',              r: 'In transit', g: true  },
    ]},
  { name: 'Point of Sale',color: '#d6489a', iconBg: '#fce7f1', period: 'Today',
    stat1: { label: "Today's sales",value: '$9,840',   change: '+22.0%' },
    stat2: { label: 'Transactions', value: '318',      change: '+11.4%' },
    rows: [
      { l: 'Sale #4471',   s: 'Card · Register 1',    r: '$42.50',     g: true  },
      { l: 'Sale #4470',   s: 'Cash · Register 3',    r: '$18.00',     g: true  },
      { l: 'Sale #4469',   s: 'Card · Register 2',    r: '$126.40',    g: true  },
    ]},
];

// ── Sparkline SVG ─────────────────────────────────────────────────
function Spark({ color }: { color: string }) {
  return (
    <svg width="100%" height="24" viewBox="0 0 110 24" preserveAspectRatio="none" style={{ display: 'block', marginTop: 7 }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.26" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 19 L18 14 L34 17 L52 9 L70 12 L88 5 L110 7 L110 24 L0 24 Z" fill={`url(#sg-${color.replace('#','')})`} />
      <path d="M0 19 L18 14 L34 17 L52 9 L70 12 L88 5 L110 7" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mini ERP panel ────────────────────────────────────────────────
function ModulePanel({ mod }: { mod: typeof MODULES[0] }) {
  return (
    <div style={{ padding: '18px 20px', animation: 'lx-swap .4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: mod.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ModIcon name={mod.name} color={mod.color} size={15} />
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1d1a36', lineHeight: 1.1 }}>{mod.name}</div>
            <div style={{ fontSize: 10.5, color: '#9794ad' }}>Overview · {mod.period}</div>
          </div>
        </div>
        <span style={{ fontSize: 10.5, color: '#86839c', border: '1px solid #ece9f5', borderRadius: 7, padding: '5px 10px' }}>{mod.period} ▾</span>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 11, marginBottom: 13 }}>
        {[mod.stat1, mod.stat2].map((st, i) => (
          <div key={i} style={{ flex: 1, border: '1px solid #f0eff7', borderRadius: 11, padding: 12 }}>
            <div style={{ fontSize: 10, color: '#9794ad', marginBottom: 3 }}>{st.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1d1a36', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              {st.value}
              <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>{st.change}</span>
            </div>
            <Spark color={mod.color} />
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div style={{ border: '1px solid #f0eff7', borderRadius: 11, padding: '2px 13px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 2px' }}>
          <span style={{ fontSize: 11, color: '#9794ad' }}>Recent activity</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#16a34a' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'lx-glow 1.6s ease-in-out infinite' }} />
            Live
          </span>
        </div>
        {mod.rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid #f4f3fa', animation: `lx-rowIn .5s ease backwards ${0.14 + i * 0.13}s` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: mod.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2c2945', lineHeight: 1.15 }}>{row.l}</div>
                <div style={{ fontSize: 10.5, color: '#9794ad' }}>{row.s}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: row.g ? '#16a34a' : '#ef5e7a' }}>{row.r}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Login ────────────────────────────────────────────────────
export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [mode, setMode]         = useState<'login' | 'signup'>('login');
  const [success, setSuccess]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [remember, setRemember] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);

  // Auto-cycle modules
  useEffect(() => {
    const t = setInterval(() => setActiveIdx(i => (i + 1) % MODULES.length), 4200);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setSuccess('Account created! You can now sign in.');
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  };

  const activeMod = MODULES[activeIdx];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .lx-root * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif !important; }
        @keyframes lx-fadeUp  { from { opacity:0; transform:translateY(18px);   } to { opacity:1; transform:translateY(0);  } }
        @keyframes lx-glow    { 0%,100% { opacity:.5; transform:scale(1);     } 50% { opacity:.8; transform:scale(1.07);  } }
        @keyframes lx-drift   { 0%,100% { transform:translate(0,0);           } 50% { transform:translate(14px,-16px);    } }
        @keyframes lx-swap    { from { opacity:0; transform:translateY(8px);   } to { opacity:1; transform:translateY(0);  } }
        @keyframes lx-rowIn   { from { opacity:0; transform:translateX(12px);  } to { opacity:1; transform:translateX(0);  } }
        @keyframes lx-sheen   { 0% { transform:translateX(-140%) skewX(-18deg); } 60%,100% { transform:translateX(320%) skewX(-18deg); } }
        .lx-signin::after {
          content:''; position:absolute; top:0; left:0;
          width:45%; height:100%;
          background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);
          animation:lx-sheen 3.4s ease-in-out infinite 1s;
        }
        .lx-rail-item:hover { background:#f2f0fb !important; }
        .lx-inp:focus { border-color:#8b5cf6 !important; background:#fff !important; box-shadow:0 0 0 4px rgba(139,92,246,.12) !important; }
        .lx-google:hover { border-color:#cdc9e8 !important; background:#fafaff !important; transform:translateY(-1px); }
        .lx-signin:hover { transform:translateY(-2px); box-shadow:0 16px 34px rgba(124,92,246,.46) !important; }
      `}</style>

      <div className="lx-root" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

            {/* ── LEFT PANEL ── */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'linear-gradient(155deg,#efedfc 0%,#e8ecfb 55%,#f1ecfa 100%)', padding: '36px 48px 36px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>

              {/* Dot grid */}
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(124,92,246,.13) 1.3px,transparent 1.3px)', backgroundSize: '24px 24px', WebkitMaskImage: 'radial-gradient(120% 90% at 35% 45%,#000 40%,transparent 78%)', maskImage: 'radial-gradient(120% 90% at 35% 45%,#000 40%,transparent 78%)', pointerEvents: 'none' }} />
              {/* Glow orbs */}
              <div style={{ position: 'absolute', right: -70, top: -50, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%,#cdbdf7,#a98ef0 70%)', opacity: .4, animation: 'lx-glow 8s ease-in-out infinite', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: -60, bottom: 20, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%,#bcd0ff,#8fb0fb 75%)', opacity: .35, animation: 'lx-glow 10s ease-in-out infinite .5s', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', right: 160, top: 130, width: 12, height: 12, borderRadius: '50%', background: '#b69bf3', opacity: .5, animation: 'lx-drift 9s ease-in-out infinite', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 60, top: 90, width: 8, height: 8, borderRadius: '50%', background: '#9bb6f3', opacity: .5, animation: 'lx-drift 11s ease-in-out infinite 1s', pointerEvents: 'none' }} />

              {/* Headline */}
              <div style={{ position: 'relative', zIndex: 2, animation: 'lx-fadeUp .8s ease both .1s' }}>
                <h2 style={{ margin: 0, fontSize: 34, lineHeight: 1.14, fontWeight: 800, letterSpacing: '-.02em', color: '#211d3d', maxWidth: 430 }}>
                  Everything in{' '}
                  <span style={{ background: 'linear-gradient(120deg,#6d5cf6,#a855f7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>one workspace</span>
                </h2>
              </div>

              {/* Mini ERP frame */}
              <div style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, background: '#fff', borderRadius: 18, boxShadow: '0 30px 70px rgba(70,55,140,.2)', overflow: 'hidden', display: 'flex', animation: 'lx-fadeUp 1s ease both .25s' }}>
                {/* Sidebar rail */}
                <div style={{ width: 192, flexShrink: 0, background: '#faf9fe', borderRight: '1px solid #f0eff7', padding: '14px 12px', overflowY: 'auto' }}>
                  <img src="/logo.png" alt="LedgerX" style={{ height: 30, width: 'auto', display: 'block', margin: '2px 0 14px 6px', objectFit: 'contain' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {MODULES.map((m, i) => (
                      <div
                        key={m.name}
                        className="lx-rail-item"
                        onClick={() => setActiveIdx(i)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          padding: '7px 8px', borderRadius: 9, cursor: 'pointer',
                          background: i === activeIdx ? '#ede9fe' : 'transparent',
                          borderLeft: i === activeIdx ? `3px solid #7c5cf6` : '3px solid transparent',
                          transition: 'all .15s',
                        }}>
                        <span style={{ width: 26, height: 26, borderRadius: 7, background: m.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <ModIcon name={m.name} color={m.color} size={13} />
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: i === activeIdx ? 700 : 500, color: i === activeIdx ? '#7c5cf6' : '#6b6885', whiteSpace: 'nowrap' }}>{m.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Module panel */}
                <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
                  <ModulePanel key={activeIdx} mod={activeMod} />
                </div>
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div style={{ width: 500, flexShrink: 0, background: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 52px', position: 'relative', zIndex: 2, overflowY: 'auto' }}>
              <div style={{ maxWidth: 392, width: '100%', margin: '0 auto', animation: 'lx-fadeUp .8s ease both' }}>

                {/* Logo */}
                <img src="/logo.png" alt="LedgerX" style={{ height: 72, width: 'auto', display: 'block', marginBottom: 20, objectFit: 'contain' }} />

                {/* Heading */}
                <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a36' }}>
                  {mode === 'login' ? 'Welcome back' : 'Create account'}
                </h1>
                <p style={{ margin: '0 0 24px', fontSize: 14.5, color: '#85839c' }}>
                  {mode === 'login' ? 'Sign in to access your workspace' : 'Get started with LedgerX today'}
                </p>

                {/* Alerts */}
                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '11px 16px', marginBottom: 18, fontSize: 13, color: '#b91c1c' }}>
                    ⚠ {error}
                  </div>
                )}
                {success && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 12, padding: '11px 16px', marginBottom: 18, fontSize: 13, color: '#15803d' }}>
                    ✓ {success}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {/* Email */}
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#46435f', marginBottom: 8 }}>Email address</label>
                  <div style={{ position: 'relative', marginBottom: 16 }}>
                    <svg style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#b0adc8', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com" required className="lx-inp"
                      style={{ width: '100%', height: 52, border: '1.5px solid #e7e6f1', borderRadius: 13, background: '#fbfbfe', padding: '0 16px 0 46px', fontSize: 14.5, color: '#2c2945', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'all .15s' }}
                    />
                  </div>

                  {/* Password */}
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#46435f', marginBottom: 8 }}>Password</label>
                  <div style={{ position: 'relative', marginBottom: 18 }}>
                    <svg style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#b0adc8', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <input
                      type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••" required minLength={6} className="lx-inp"
                      style={{ width: '100%', height: 52, border: '1.5px solid #e7e6f1', borderRadius: 13, background: '#fbfbfe', padding: '0 46px', fontSize: 14.5, color: '#2c2945', outline: 'none', boxSizing: 'border-box', letterSpacing: '.04em', fontFamily: 'inherit', transition: 'all .15s' }}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: '#b0adc8' }}>
                      {showPw
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>

                  {/* Remember + Forgot */}
                  {mode === 'login' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                      <button type="button" onClick={() => setRemember(!remember)} style={{ display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                        <span style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${remember ? '#7c5cf6' : '#d4d2e0'}`, background: remember ? '#7c5cf6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s', flexShrink: 0 }}>
                          {remember && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </span>
                        <span style={{ fontSize: 13.5, color: '#5a5872', fontWeight: 500 }}>Remember me</span>
                      </button>
                      <a href="#" style={{ fontSize: 13.5, fontWeight: 600, color: '#7c5cf6', textDecoration: 'none' }}>Forgot password?</a>
                    </div>
                  )}

                  {/* Sign in button */}
                  <button
                    type="submit" disabled={loading}
                    className="lx-signin"
                    style={{ position: 'relative', overflow: 'hidden', width: '100%', height: 54, border: 'none', borderRadius: 13, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 15.5, fontWeight: 700, color: '#fff', background: loading ? '#c4b5fd' : 'linear-gradient(105deg,#5b59f2 0%,#8b5cf6 52%,#a855f7 100%)', boxShadow: loading ? 'none' : '0 12px 26px rgba(124,92,246,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'transform .18s, box-shadow .18s' }}>
                    {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create Account'}
                    {!loading && <span style={{ fontSize: 18 }}>→</span>}
                  </button>
                </form>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0' }}>
                  <span style={{ flex: 1, height: 1, background: '#ebeaf3' }} />
                  <span style={{ fontSize: 12.5, color: '#9b99ad' }}>or continue with</span>
                  <span style={{ flex: 1, height: 1, background: '#ebeaf3' }} />
                </div>

                {/* Google */}
                <button
                  type="button" onClick={handleGoogle}
                  className="lx-google"
                  style={{ width: '100%', height: 50, border: '1.5px solid #e9e8f2', borderRadius: 12, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600, color: '#3d3b54', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all .15s' }}>
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
                    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
                  </svg>
                  Continue with Google
                </button>

                <p style={{ textAlign: 'center', margin: '18px 0 0', fontSize: 14, color: '#85839c' }}>
                  {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
                    style={{ color: '#7c5cf6', fontWeight: 700, textDecoration: 'none' }}>
                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{ borderTop: '1px solid #f0eff7', padding: '14px 52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, background: '#fcfcff', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <span style={{ fontSize: 12.5, color: '#8a889e' }}>© 2025 LedgerX</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#cdcad9', display: 'inline-block' }} />
              {['Privacy', 'Terms', 'Support'].map(l => (
                <a key={l} href="#" style={{ fontSize: 12.5, color: '#8a889e', textDecoration: 'none' }}>{l}</a>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 11.5, color: '#a3a0b5' }}>Powered by</span>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-.01em', color: '#2c2945' }}>Aurax<span style={{ color: '#7c5cf6' }}>.dev</span></span>
              <span style={{ fontSize: 11, color: '#bdbacb' }}>by Aurax (Pvt) Ltd</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

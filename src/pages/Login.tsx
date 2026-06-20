import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

function DashboardMockup() {
  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      boxShadow: '0 24px 64px rgba(109,40,217,0.14), 0 4px 16px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      display: 'flex',
      height: 280,
      fontSize: 10,
      color: '#374151',
      position: 'relative',
      zIndex: 2,
    }}>
      {/* Sidebar */}
      <div style={{ width: 88, background: '#fff', borderRight: '1px solid #f3f4f6', padding: '10px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 10px 8px', fontWeight: 800, fontSize: 9, color: '#7c3aed', borderBottom: '1px solid #f3f4f6', marginBottom: 6 }}>LedgerX</div>
        {['Dashboard','Sales','Purchases','Inventory','Accounting','Reports','Settings'].map((item, i) => (
          <div key={item} style={{
            padding: '4px 10px', fontSize: 8.5,
            color: i === 0 ? '#7c3aed' : '#9ca3af',
            background: i === 0 ? '#faf5ff' : 'transparent',
            borderRight: i === 0 ? '2px solid #7c3aed' : 'none',
            fontWeight: i === 0 ? 700 : 400,
          }}>{item}</div>
        ))}
        <div style={{ margin: '6px 8px 0', background: '#fef2f2', borderRadius: 6, padding: '5px 7px' }}>
          <div style={{ fontSize: 7, color: '#ef4444', fontWeight: 600 }}>Invoices Overdue</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#dc2626', lineHeight: 1.2 }}>12</div>
          <div style={{ fontSize: 7, color: '#7c3aed', marginTop: 2 }}>View all</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: '10px 12px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>Dashboard</div>
          <div style={{ fontSize: 7.5, color: '#9ca3af', background: '#f9fafb', padding: '2px 7px', borderRadius: 4 }}>This Month ▾</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 6 }}>
          {[
            { label: 'Total Revenue', value: '$248,600', change: '+12.5%', up: true, pts: '0,16 8,13 16,9 24,11 32,6 40,8 48,3' },
            { label: 'Total Expenses', value: '$84,250', change: '-8.2%', up: false, pts: '0,4 8,7 16,5 24,11 32,9 40,13 48,11' },
            { label: 'Net Profit', value: '$164,350', change: '+18.7%', up: true, pts: '0,14 8,11 16,7 24,9 32,4 40,6 48,2' },
          ].map(m => (
            <div key={m.label} style={{ background: '#f9fafb', borderRadius: 7, padding: '7px' }}>
              <div style={{ fontSize: 6.5, color: '#9ca3af', marginBottom: 1 }}>{m.label}</div>
              <div style={{ fontSize: 10, fontWeight: 700 }}>{m.value}</div>
              <div style={{ fontSize: 6.5, color: m.up ? '#10b981' : '#ef4444' }}>{m.change}</div>
              <svg width="100%" height="18" style={{ display: 'block', marginTop: 2 }}>
                <polyline points={m.pts} fill="none" stroke={m.up ? '#10b981' : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.75fr', gap: 5 }}>
          <div style={{ background: '#f9fafb', borderRadius: 7, padding: '7px' }}>
            <div style={{ fontSize: 6.5, color: '#9ca3af' }}>Cash Flow</div>
            <div style={{ fontSize: 10, fontWeight: 700 }}>$72,430</div>
            <div style={{ fontSize: 6.5, color: '#10b981' }}>+16.3%</div>
            <svg width="100%" height="32" style={{ display: 'block', marginTop: 2 }}>
              <defs>
                <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points="0,30 10,24 20,27 32,17 44,20 56,10 68,13 80,7 90,10 90,30" fill="url(#cf)" />
              <polyline points="0,24 10,20 20,23 32,13 44,16 56,6 68,9 80,3 90,6" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div style={{ background: '#f9fafb', borderRadius: 7, padding: '7px' }}>
            <div style={{ fontSize: 6.5, color: '#9ca3af', marginBottom: 5 }}>Top Products</div>
            {[['Product A','$38,540',82],['Product B','$24,120',54],['Product C','$18,760',40],['Product D','$12,430',28]].map(([n,v,w]) => (
              <div key={n as string} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                  <span style={{ fontSize: 6.5, color: '#6b7280' }}>{n}</span>
                  <span style={{ fontSize: 6.5, color: '#374151', fontWeight: 600 }}>{v}</span>
                </div>
                <div style={{ height: 3, background: '#e5e7eb', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${w}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#f9fafb', borderRadius: 7, padding: '7px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 6.5, color: '#9ca3af' }}>Bank Balance</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, marginTop: 3, color: '#111827' }}>$128,250</div>
              <div style={{ fontSize: 6, color: '#9ca3af', marginTop: 2 }}>Updated just now</div>
            </div>
            <div style={{ width: 26, height: 26, background: '#ede9fe', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🏦</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [success, setSuccess] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
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

  const inputBase: React.CSSProperties = {
    width: '100%', padding: '11px 14px 11px 40px',
    border: '1.5px solid #e5e7eb', borderRadius: 10,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
    color: '#111827', background: '#fff', transition: 'all 0.15s',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* ── Left panel (light lavender) ── */}
      <div style={{
        flex: '0 0 54%',
        background: 'linear-gradient(150deg, #f5f3ff 0%, #ede9fe 60%, #ddd6fe 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '44px 52px',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Decorative cloud (top-right) */}
        <div style={{ position: 'absolute', top: 30, right: -30, zIndex: 1 }}>
          <div style={{ position: 'relative', width: 180, height: 100 }}>
            <div style={{ position:'absolute', bottom:0, left:20, width:110, height:60, background:'white', borderRadius:'50%', boxShadow:'0 8px 24px rgba(0,0,0,0.08)' }} />
            <div style={{ position:'absolute', bottom:18, left:5, width:70, height:55, background:'white', borderRadius:'50%', boxShadow:'0 8px 24px rgba(0,0,0,0.06)' }} />
            <div style={{ position:'absolute', bottom:24, left:35, width:80, height:65, background:'white', borderRadius:'50%', boxShadow:'0 8px 24px rgba(0,0,0,0.06)' }} />
            <div style={{ position:'absolute', bottom:28, left:60, width:65, height:52, background:'white', borderRadius:'50%', boxShadow:'0 6px 18px rgba(0,0,0,0.06)' }} />
          </div>
        </div>

        {/* Decorative sphere (bottom-right of mockup area) */}
        <div style={{
          position: 'absolute', right: 40, top: '42%',
          width: 110, height: 110, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, #a78bfa, #6d28d9)',
          boxShadow: '0 12px 40px rgba(109,40,217,0.35)',
          zIndex: 1,
        }} />

        {/* CLOUD ERP badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'white', border: '1px solid #ddd6fe',
          borderRadius: 20, padding: '5px 14px',
          fontSize: 11, fontWeight: 700, color: '#7c3aed',
          letterSpacing: '0.06em', alignSelf: 'flex-start',
          marginBottom: 28, boxShadow: '0 2px 8px rgba(124,58,237,0.1)',
          zIndex: 2, position: 'relative',
        }}>
          <span style={{ width: 6, height: 6, background: '#7c3aed', borderRadius: '50%', display: 'inline-block' }} />
          CLOUD ERP
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 36, fontWeight: 800, color: '#1e1b4b',
          margin: '0 0 14px', lineHeight: 1.2, letterSpacing: '-0.8px',
          zIndex: 2, position: 'relative', maxWidth: 380,
        }}>
          Run your business<br />
          in the{' '}
          <span style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            cloud
          </span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 14, color: '#6b7280', lineHeight: 1.7,
          margin: '0 0 28px', maxWidth: 360,
          zIndex: 2, position: 'relative',
        }}>
          LedgerX is the all-in-one cloud ERP to manage your finances,
          operations, and growth — in real time, from anywhere.
        </p>

        {/* Dashboard mockup */}
        <div style={{ position: 'relative', zIndex: 2, marginBottom: 24 }}>
          <DashboardMockup />
        </div>

        {/* Feature row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, zIndex: 2, position: 'relative' }}>
          {[
            { icon: '🔒', title: 'Secure & Reliable', desc: 'Enterprise-grade security' },
            { icon: '☁️', title: 'Always Available', desc: 'Access from any device' },
            { icon: '⚡', title: 'Built for Growth', desc: 'Scales with your business' },
            { icon: '👥', title: 'Work Together', desc: 'Collaborate in real time' },
          ].map(f => (
            <div key={f.title} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '10px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.9)' }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{f.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1e1b4b', marginBottom: 2 }}>{f.title}</div>
              <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1.4 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel (white) ── */}
      <div style={{
        flex: 1,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <img src="/logo.png" alt="LedgerX" style={{ height: 52, objectFit: 'contain', marginBottom: 8 }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1e1b4b', letterSpacing: '-0.3px' }}>LedgerX</div>
          </div>

          {/* Heading */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.4px' }}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>
              {mode === 'login' ? 'Sign in to access your workspace' : 'Get started with LedgerX today'}
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div style={{ background: '#fef3f2', border: '1px solid #fecdca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b42318', display: 'flex', gap: 8 }}>
              <span>⚠</span> {error}
            </div>
          )}
          {success && (
            <div style={{ background: '#ecfdf3', border: '1px solid #abefc6', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#027a48', display: 'flex', gap: 8 }}>
              <span>✓</span> {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 14, position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Email address</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#d1d5db', fontSize: 15 }}>✉</span>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" required
                  style={inputBase}
                  onFocus={e => { e.target.style.borderColor = '#7c3aed'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 16, position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#d1d5db', fontSize: 14 }}>🔒</span>
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••" required minLength={6}
                  style={{ ...inputBase, paddingRight: 42 }}
                  onFocus={e => { e.target.style.borderColor = '#7c3aed'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: 0, lineHeight: 1 }}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            {mode === 'login' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                    style={{ accentColor: '#7c3aed', width: 15, height: 15, borderRadius: 4 }} />
                  Remember me
                </label>
                <button type="button" style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  Forgot password?
                </button>
              </div>
            )}

            {/* Sign In */}
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px',
                background: loading ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(124,58,237,0.3)',
                transition: 'all 0.2s', marginBottom: 16,
              }}
              onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(124,58,237,0.4)'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(124,58,237,0.3)'; }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
          </div>

          {/* Google */}
          <button
            type="button" onClick={handleGoogle}
            style={{
              width: '100%', padding: '12px', background: 'white',
              border: '1.5px solid #e5e7eb', borderRadius: 10,
              fontSize: 14, fontWeight: 600, color: '#374151',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.15s', marginBottom: 24,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg>
            Continue with Google
          </button>

          {/* Toggle */}
          <p style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af', margin: 0 }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: 0 }}>
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, fontSize: 12, color: '#d1d5db', textAlign: 'center' }}>
          © 2025 LedgerX · All rights reserved
        </div>
      </div>
    </div>
  );
}

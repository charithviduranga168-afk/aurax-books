import { useState } from 'react';
import { supabase } from '../supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: 'Inter, sans-serif',
      background: '#0f0a2e',
    }}>
      {/* ── Left panel ── */}
      <div style={{
        flex: '0 0 48%',
        background: 'linear-gradient(145deg, #1a0a5e 0%, #3b1fa8 45%, #6c47ff 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', top: -80, left: -80 }} />
        <div style={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', bottom: -60, right: -60 }} />
        <div style={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', background: 'rgba(108,71,255,0.3)', top: '40%', right: -40 }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 48 }}>
          <img
            src="/logo.png"
            alt="LedgerX"
            style={{ height: 120, objectFit: 'contain', marginBottom: 20, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))' }}
          />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 500 }}>
            Smart ERP for Sri Lanka
          </div>
        </div>

        {/* Feature list */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 320 }}>
          {[
            { icon: '📊', label: 'Full Accounting & Invoicing' },
            { icon: '🏭', label: 'Manufacturing & MRP' },
            { icon: '👥', label: 'HR, Payroll & Payslips' },
            { icon: '🛍️', label: 'E-Commerce Storefront' },
            { icon: '🔒', label: 'Customer Portal & Payments' },
          ].map(f => (
            <div key={f.label} style={{
              display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16,
              background: 'rgba(255,255,255,0.08)', borderRadius: 12,
              padding: '12px 18px', backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <span style={{ fontSize: 18 }}>{f.icon}</span>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500 }}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Bottom tagline */}
        <div style={{ position: 'relative', zIndex: 1, marginTop: 40, textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>© 2025 LedgerX · Built for Sri Lankan SMEs</div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#0f0a2e', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
              {mode === 'login'
                ? 'Sign in to your LedgerX account'
                : 'Start your free LedgerX account today'}
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div style={{
              background: '#fef3f2', border: '1px solid #fecdca', borderRadius: 10,
              padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#b42318',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠</span> {error}
            </div>
          )}
          {success && (
            <div style={{
              background: '#ecfdf3', border: '1px solid #abefc6', borderRadius: 10,
              padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#027a48',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>✓</span> {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.lk"
                required
                style={{
                  width: '100%', padding: '13px 16px', border: '1.5px solid #e5e7eb',
                  borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  color: '#111827', background: '#f9fafb', transition: 'all 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = '#6c47ff'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,71,255,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                style={{
                  width: '100%', padding: '13px 16px', border: '1.5px solid #e5e7eb',
                  borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  color: '#111827', background: '#f9fafb', transition: 'all 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = '#6c47ff'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(108,71,255,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading ? '#a78bfa' : 'linear-gradient(135deg, #3b1fa8, #6c47ff)',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(108,71,255,0.4)',
                transition: 'all 0.2s', letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget.style.transform = 'translateY(-1px)'); }}
              onMouseLeave={e => { (e.currentTarget.style.transform = 'translateY(0)'); }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          {/* Toggle mode */}
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: '#6b7280' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              style={{ background: 'none', border: 'none', color: '#6c47ff', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0 }}>
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>

          {/* Rs pricing note */}
          <div style={{ marginTop: 40, padding: '14px 18px', background: '#f8f7ff', borderRadius: 12, border: '1px solid #ede9fe', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 700, marginBottom: 2 }}>Rs. 3,000 / month</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Full ERP access · Unlimited users · Local support</div>
          </div>
        </div>
      </div>
    </div>
  );
}

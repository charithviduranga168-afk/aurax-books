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
    }}>
      {/* ── Left panel ── */}
      <div style={{
        flex: '0 0 48%',
        background: 'linear-gradient(145deg, #5b21b6 0%, #7c3aed 40%, #9333ea 70%, #c026d3 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(192,132,252,0.25)', top: -120, left: -100, filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(6,182,212,0.15)', bottom: -80, right: -60, filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(244,114,182,0.2)', top: '55%', left: '10%', filter: 'blur(40px)' }} />

        {/* Subtle dot grid pattern */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 44 }}>
          <img
            src="/logo.png"
            alt="LedgerX"
            style={{ height: 130, objectFit: 'contain', marginBottom: 20, filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.25))' }}
          />
          <div style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.3px',
            lineHeight: 1.3,
            maxWidth: 280,
            margin: '0 auto',
          }}>
            Control your business<br />in one clear view
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
              display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: '11px 18px',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}>
              <span style={{ fontSize: 17 }}>{f.icon}</span>
              <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 500 }}>{f.label}</span>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', zIndex: 1, marginTop: 36, color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
          © 2025 LedgerX · Built for Sri Lankan SMEs
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1,
        background: '#f8f7ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Tiny logo mark for context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <img src="/logo.png" alt="LedgerX" style={{ height: 32, objectFit: 'contain' }} />
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1e1b4b', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              {mode === 'login' ? 'Welcome back 👋' : 'Create your account'}
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
              {mode === 'login' ? 'Sign in to continue to LedgerX' : 'Get started with LedgerX today'}
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div style={{
              background: '#fef3f2', border: '1px solid #fecdca', borderRadius: 12,
              padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#b42318',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠</span> {error}
            </div>
          )}
          {success && (
            <div style={{
              background: '#ecfdf3', border: '1px solid #abefc6', borderRadius: 12,
              padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#027a48',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>✓</span> {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
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
                  color: '#111827', background: '#fff', transition: 'all 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = '#9333ea'; e.target.style.boxShadow = '0 0 0 3px rgba(147,51,234,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
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
                  color: '#111827', background: '#fff', transition: 'all 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = '#9333ea'; e.target.style.boxShadow = '0 0 0 3px rgba(147,51,234,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading
                  ? '#c4b5fd'
                  : 'linear-gradient(135deg, #7c3aed 0%, #9333ea 60%, #c026d3 100%)',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(147,51,234,0.35)',
                transition: 'all 0.2s', letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(147,51,234,0.45)'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(147,51,234,0.35)'; }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          {/* Toggle */}
          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 14, color: '#6b7280' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              style={{ background: 'none', border: 'none', color: '#9333ea', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0 }}>
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>

          {/* Pricing */}
          <div style={{ marginTop: 36, padding: '16px 20px', background: 'white', borderRadius: 14, border: '1px solid #ede9fe', textAlign: 'center', boxShadow: '0 1px 6px rgba(147,51,234,0.08)' }}>
            <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 800, marginBottom: 3 }}>Rs. 3,000 / month</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Full ERP access · Unlimited users · Local support</div>
          </div>
        </div>
      </div>
    </div>
  );
}

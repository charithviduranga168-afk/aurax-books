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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setSuccess('Account created! You can now sign in.');
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg, #1a0a5e 0%, #3b1fa8 50%, #6c47ff 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Left decorative side */}
      <div
        style={{ flex: 1, maxWidth: '480px', padding: '40px', display: 'none' }}
      />

      {/* Login card */}
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#fff',
          borderRadius: '20px',
          padding: '40px',
          boxShadow: '0 25px 80px rgba(27,10,110,0.4)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>📒</div>
          <h1
            style={{
              fontFamily: 'Inter Tight, sans-serif',
              fontSize: '22px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #3b1fa8, #6c47ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '2px',
              marginBottom: '6px',
            }}
          >
            AURAX BOOKS
          </h1>
          <p style={{ fontSize: '13px', color: '#5a5f7a' }}>
            Accounting for Sri Lankan SMEs
          </p>
        </div>

        <h2
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#1a1d2e',
            marginBottom: '20px',
          }}
        >
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h2>

        {error && (
          <div
            style={{
              background: '#fef3f2',
              border: '1px solid #fecdca',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#b42318',
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              background: '#ecfdf3',
              border: '1px solid #abefc6',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#027a48',
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#5a5f7a',
                marginBottom: '6px',
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.lk"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #e2e4ed',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#6c47ff')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e4ed')}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#5a5f7a',
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #e2e4ed',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#6c47ff')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e4ed')}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: 'linear-gradient(135deg, #3b1fa8, #6c47ff)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 4px 14px rgba(108,71,255,0.4)',
              transition: 'all 0.2s',
            }}
          >
            {loading
              ? 'Please wait...'
              : mode === 'login'
              ? 'Sign In →'
              : 'Create Account →'}
          </button>
        </form>

        <p
          style={{
            textAlign: 'center',
            marginTop: '20px',
            fontSize: '13px',
            color: '#5a5f7a',
          }}
        >
          {mode === 'login'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
              setSuccess('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#6c47ff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>

        <p
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '11px',
            color: '#9096b0',
            borderTop: '1px solid #f0f1f6',
            paddingTop: '16px',
          }}
        >
          © 2025 Aurax.dev · Rs. 3,000/month
        </p>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        flex: '0 0 52%',
        background: 'linear-gradient(145deg, #0f0c29 0%, #1a1050 35%, #2d1b69 65%, #4a2080 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 56px',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Background glow orbs */}
        <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)', top:-100, left:-100, pointerEvents:'none' }} />
        <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)', bottom:-80, right:-80, pointerEvents:'none' }} />
        <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 70%)', top:'45%', right:'10%', pointerEvents:'none' }} />

        {/* Subtle grid */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:56, position:'relative', zIndex:1 }}>
          <img src="/logo.png" alt="LedgerX" style={{ height:38, objectFit:'contain', filter:'brightness(0) invert(1)' }} />
          <span style={{ color:'white', fontSize:20, fontWeight:800, letterSpacing:'-0.3px' }}>LedgerX</span>
        </div>

        {/* Headline */}
        <div style={{ position:'relative', zIndex:1, marginBottom:20 }}>
          <div style={{ display:'inline-block', background:'rgba(139,92,246,0.2)', border:'1px solid rgba(139,92,246,0.4)', borderRadius:20, padding:'4px 14px', fontSize:11, fontWeight:700, color:'#a78bfa', letterSpacing:'0.08em', marginBottom:20 }}>
            CLOUD ERP PLATFORM
          </div>
          <h1 style={{ fontSize:42, fontWeight:900, color:'white', margin:'0 0 16px', lineHeight:1.15, letterSpacing:'-1px' }}>
            Control your<br />
            <span style={{ background:'linear-gradient(135deg, #a78bfa, #60a5fa, #f472b6)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
              business
            </span>{' '}in one<br />
            clear view.
          </h1>
          <p style={{ fontSize:15, color:'rgba(255,255,255,0.5)', lineHeight:1.7, margin:0, maxWidth:340 }}>
            The all-in-one ERP built for Sri Lankan businesses. Finance, inventory, HR, and more — all in one place.
          </p>
        </div>

        {/* Glassmorphism stat cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:36, position:'relative', zIndex:1 }}>
          {[
            { icon:'💰', value:'LKR 2.4M', label:'Monthly Revenue', color:'#a78bfa' },
            { icon:'📦', value:'13 Modules', label:'All-in-One Platform', color:'#60a5fa' },
            { icon:'⚡', value:'Real-time', label:'Live Business Data', color:'#34d399' },
            { icon:'🔒', value:'100% Secure', label:'Enterprise Grade', color:'#f472b6' },
          ].map(c => (
            <div key={c.label} style={{
              background:'rgba(255,255,255,0.06)',
              backdropFilter:'blur(12px)',
              border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:16,
              padding:'18px 20px',
              transition:'all 0.2s',
            }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{c.icon}</div>
              <div style={{ fontSize:18, fontWeight:800, color:c.color, marginBottom:3, letterSpacing:'-0.3px' }}>{c.value}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:500 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Testimonial / trust line */}
        <div style={{ marginTop:36, position:'relative', zIndex:1, display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex' }}>
            {['#7c3aed','#2563eb','#db2777'].map((c,i) => (
              <div key={i} style={{ width:28, height:28, borderRadius:'50%', background:c, border:'2px solid rgba(255,255,255,0.15)', marginLeft:i>0?-8:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'white', fontWeight:700 }}>
                {['A','S','K'][i]}
              </div>
            ))}
          </div>
          <div>
            <div style={{ color:'rgba(255,255,255,0.85)', fontSize:12, fontWeight:600 }}>Trusted by 500+ Sri Lankan businesses</div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:11, marginTop:1 }}>Join businesses already using LedgerX</div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        flex:1,
        background:'#ffffff',
        display:'flex',
        flexDirection:'column',
        alignItems:'center',
        justifyContent:'center',
        padding:'48px 40px',
        position:'relative',
      }}>

        {/* Subtle top-right accent */}
        <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', pointerEvents:'none' }} />

        <div style={{ width:'100%', maxWidth:380 }}>

          {/* Logo mark */}
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <img src="/logo.png" alt="LedgerX" style={{ height:48, objectFit:'contain', marginBottom:10 }} />
            <div style={{ fontSize:18, fontWeight:800, color:'#1e1b4b', letterSpacing:'-0.3px' }}>LedgerX</div>
          </div>

          {/* Heading */}
          <div style={{ marginBottom:28 }}>
            <h1 style={{ fontSize:26, fontWeight:800, color:'#111827', margin:'0 0 6px', letterSpacing:'-0.5px', textAlign:'center' }}>
              {mode === 'login' ? 'Welcome back 👋' : 'Create an account'}
            </h1>
            <p style={{ fontSize:14, color:'#9ca3af', margin:0, textAlign:'center' }}>
              {mode === 'login' ? 'Sign in to access your workspace' : 'Get started with LedgerX today'}
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div style={{ background:'#fef3f2', border:'1px solid #fecdca', borderRadius:10, padding:'11px 14px', marginBottom:16, fontSize:13, color:'#b42318', display:'flex', gap:8, alignItems:'center' }}>
              <span>⚠</span> {error}
            </div>
          )}
          {success && (
            <div style={{ background:'#ecfdf3', border:'1px solid #abefc6', borderRadius:10, padding:'11px 14px', marginBottom:16, fontSize:13, color:'#027a48', display:'flex', gap:8, alignItems:'center' }}>
              <span>✓</span> {success}
            </div>
          )}

          {/* Google button — top */}
          <button
            type="button" onClick={handleGoogle}
            style={{
              width:'100%', padding:'12px', background:'white',
              border:'1.5px solid #e5e7eb', borderRadius:10,
              fontSize:14, fontWeight:600, color:'#374151',
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              transition:'all 0.15s', marginBottom:20,
              boxShadow:'0 1px 3px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='#f9fafb'; (e.currentTarget as HTMLButtonElement).style.borderColor='#d1d5db'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='white'; (e.currentTarget as HTMLButtonElement).style.borderColor='#e5e7eb'; }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:'#f3f4f6' }} />
            <span style={{ fontSize:12, color:'#d1d5db', fontWeight:500 }}>or sign in with email</span>
            <div style={{ flex:1, height:1, background:'#f3f4f6' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>Email address</label>
              <div style={{ position:'relative' }}>
                <svg style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.lk" required
                  style={{ width:'100%', padding:'11px 14px 11px 40px', border:'1.5px solid #e5e7eb', borderRadius:10, fontSize:14, outline:'none', boxSizing:'border-box', color:'#111827', background:'#fafafa', transition:'all 0.15s' }}
                  onFocus={e => { e.target.style.borderColor='#8b5cf6'; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(139,92,246,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor='#e5e7eb'; e.target.style.background='#fafafa'; e.target.style.boxShadow='none'; }}
                />
              </div>
            </div>

            <div style={{ marginBottom:mode === 'login' ? 8 : 22 }}>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>Password</label>
              <div style={{ position:'relative' }}>
                <svg style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                  style={{ width:'100%', padding:'11px 40px 11px 40px', border:'1.5px solid #e5e7eb', borderRadius:10, fontSize:14, outline:'none', boxSizing:'border-box', color:'#111827', background:'#fafafa', transition:'all 0.15s' }}
                  onFocus={e => { e.target.style.borderColor='#8b5cf6'; e.target.style.background='#fff'; e.target.style.boxShadow='0 0 0 3px rgba(139,92,246,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor='#e5e7eb'; e.target.style.background='#fafafa'; e.target.style.boxShadow='none'; }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:0, lineHeight:1, display:'flex', alignItems:'center' }}>
                  {showPw
                    ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
                <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#6b7280', cursor:'pointer', userSelect:'none' }}>
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor:'#8b5cf6', width:14, height:14 }} />
                  Remember me
                </label>
                <button type="button" style={{ background:'none', border:'none', color:'#8b5cf6', fontSize:13, fontWeight:600, cursor:'pointer', padding:0 }}>
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width:'100%', padding:'13px',
                background: loading ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed 0%, #9333ea 60%, #a855f7 100%)',
                color:'#fff', border:'none', borderRadius:10,
                fontSize:15, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(124,58,237,0.4)',
                transition:'all 0.2s', letterSpacing:'0.01em',
              }}
              onMouseEnter={e => { if (!loading) { const b = e.currentTarget as HTMLButtonElement; b.style.transform='translateY(-1px)'; b.style.boxShadow='0 8px 28px rgba(124,58,237,0.5)'; } }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.transform='translateY(0)'; b.style.boxShadow='0 4px 20px rgba(124,58,237,0.4)'; }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          {/* Toggle */}
          <p style={{ textAlign:'center', marginTop:20, fontSize:13, color:'#9ca3af' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              style={{ background:'none', border:'none', color:'#8b5cf6', cursor:'pointer', fontSize:13, fontWeight:700, padding:0 }}>
              {mode === 'login' ? 'Sign up free' : 'Sign in'}
            </button>
          </p>
        </div>

        <div style={{ marginTop:40, fontSize:11, color:'#e5e7eb', textAlign:'center' }}>
          © 2025 LedgerX · All rights reserved
        </div>
      </div>
    </div>
  );
}

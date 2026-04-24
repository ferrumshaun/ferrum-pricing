import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState('login'); // 'login' | 'forgot' | 'sent'
  const { signIn } = useAuth();
  const navigate   = useNavigate();

  async function handleSignIn(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) setError(err.message);
    else navigate('/');
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login',
    });
    setLoading(false);
    if (err) setError(err.message);
    else setMode('sent');
  }

  const Logo = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
      <div style={{ width: 32, height: 32, background: '#0f1e3c', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>F</span>
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1e3c' }}>FerrumIT</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>Pricing Platform</div>
      </div>
    </div>
  );

  const card = { width: 380, padding: 32, background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' };
  const wrap = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' };
  const inp  = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, outline: 'none' };
  const btn  = (disabled) => ({ width: '100%', padding: '9px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: disabled ? 0.7 : 1 });
  const lnk  = { background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

  if (mode === 'sent') {
    return (
      <div style={wrap}><div style={card}>
        <Logo />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f1e3c', marginBottom: 8 }}>Check your email</h2>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20, lineHeight: 1.6 }}>
            We sent a password reset link to <strong>{email}</strong>.<br/>
            Click the link in that email to set your password, then come back here to sign in.
          </p>
          <button onClick={() => setMode('login')} style={{ ...btn(false), background: '#f3f4f6', color: '#374151' }}>
            Back to sign in
          </button>
        </div>
      </div></div>
    );
  }

  if (mode === 'forgot') {
    return (
      <div style={wrap}><div style={card}>
        <Logo />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Reset password</h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Enter your email and we'll send a reset link.</p>
        <form onSubmit={handleForgot}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inp} placeholder="you@ferrumit.com" autoFocus />
          </div>
          {error && <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#dc2626', marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={btn(loading)}>
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => { setMode('login'); setError(''); }} style={lnk}>Back to sign in</button>
        </div>
      </div></div>
    );
  }

  return (
    <div style={wrap}><div style={card}>
      <Logo />
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Sign in</h2>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Use your FerrumIT account credentials</p>
      <form onSubmit={handleSignIn}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inp} placeholder="you@ferrumit.com" />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inp} placeholder="••••••••" />
        </div>
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <button type="button" onClick={() => { setMode('forgot'); setError(''); }} style={lnk}>
            Forgot password?
          </button>
        </div>
        {error && <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#dc2626', marginBottom: 14 }}>{error}</div>}
        <button type="submit" disabled={loading} style={btn(loading)}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div></div>
  );
}

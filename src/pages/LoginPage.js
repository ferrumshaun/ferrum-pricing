import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { signIn } = useAuth();
  const navigate   = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) setError(err.message);
    else navigate('/');
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
      <div style={{ width: 380, padding: 32, background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 32, height: 32, background: '#0f1e3c', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>F</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1e3c' }}>FerrumIT</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Pricing Platform</div>
          </div>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Sign in</h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Use your FerrumIT account credentials</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, outline: 'none' }}
              placeholder="you@ferrumit.com" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, outline: 'none' }}
              placeholder="••••••••" />
          </div>
          {error && <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#dc2626', marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '9px', background: '#0f1e3c', color: 'white',
            border: 'none', borderRadius: 5, fontSize: 13, fontWeight: 600,
            opacity: loading ? 0.7 : 1
          }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

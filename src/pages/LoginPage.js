import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('/ferrum-logo.png');

  useEffect(() => {
    // Try to load custom logo from DB — falls back to /ferrum-logo.png if unauthenticated or not set
    supabase.from('pricing_settings').select('value').eq('key', 'company_logo_url').single()
      .then(({ data }) => { if (data?.value) setLogoUrl(data.value); })
      .catch(() => {}); // silently fall back to default
  }, []);
  const { user }  = useAuth();
  const navigate  = useNavigate();

  // Handle errors redirected back from Microsoft/Supabase
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const desc = params.get('error_description') || 'Authentication error';
      setError(desc.replace(/\+/g, ' '));
    }
  }, []);

  // Already logged in — go to app
  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  async function signInWithMicrosoft() {
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid',
        redirectTo: window.location.origin + '/',
      }
    });
    if (err) { setError(err.message); setLoading(false); }
    // On success Supabase redirects the browser — no need to handle here
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f8fafc' }}>
      <div style={{ width:400, padding:36, background:'white', borderRadius:12, border:'1px solid #e5e7eb', boxShadow:'0 4px 24px rgba(0,0,0,0.07)' }}>

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:28 }}>
          {logoUrl ? (
            <div style={{ background:'#0f1e3c', borderRadius:10, padding:'12px 20px', display:'inline-block' }}>
              <img src={logoUrl} alt="Company Logo"
                style={{ height: 48, maxWidth: 220, objectFit: 'contain', display: 'block' }} />
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, background:'#0f1e3c', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ color:'white', fontSize:20, fontWeight:700 }}>F</span>
              </div>
              <div>
                <div style={{ fontSize:17, fontWeight:700, color:'#0f1e3c' }}>FerrumIT</div>
                <div style={{ fontSize:11, color:'#6b7280' }}>Pricing Platform</div>
              </div>
            </div>
          )}
        </div>

        <h2 style={{ fontSize:16, fontWeight:700, color:'#111827', marginBottom:6, textAlign:'center' }}>Welcome back</h2>
        <p style={{ fontSize:12, color:'#6b7280', marginBottom:28, textAlign:'center' }}>
          Sign in with your FerrumIT Microsoft account
        </p>

        {/* Error */}
        {error && (
          <div style={{ padding:'8px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, fontSize:12, color:'#dc2626', marginBottom:16, textAlign:'center' }}>
            {error}
          </div>
        )}

        {/* Microsoft Sign In Button */}
        <button onClick={signInWithMicrosoft} disabled={loading}
          style={{ width:'100%', padding:'11px 16px', background: loading ? '#f3f4f6' : '#0f1e3c', color: loading ? '#9ca3af' : 'white', border:'none', borderRadius:7, fontSize:14, fontWeight:600, cursor: loading ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, transition:'background 0.15s' }}>
          {/* Microsoft logo SVG */}
          {!loading && (
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
          )}
          {loading ? 'Redirecting to Microsoft...' : 'Sign in with Microsoft'}
        </button>

        <p style={{ fontSize:11, color:'#9ca3af', textAlign:'center', marginTop:20, lineHeight:1.5 }}>
          Access is restricted to FerrumIT team members.<br/>
          Contact your admin if you need access.
        </p>

        {/* Legal warning banner */}
        <div style={{ marginTop:16, padding:'10px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#991b1b', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>
            ⚠ System Use Notice
          </div>
          <p style={{ fontSize:9, color:'#7f1d1d', lineHeight:1.6, margin:0 }}>
            Unauthorized or improper use of this system may result in disciplinary action and/or civil charges/criminal penalties and/or prosecution by law. Evidence of unauthorized use collected during monitoring may be used for administrative, criminal, or other adverse action. By continued use of this system, you indicate your awareness of and consent to these terms and conditions of use.
          </p>
        </div>

      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import changelog from '../data/changelog.json';

const STORAGE_KEY = 'ferrum_changelog_last_seen';

const NAV = [
  { to: '/quotes',   label: 'Saved Quotes', icon: '📋' },
];
const ADMIN_NAV = [
  { to: '/admin',    label: 'Admin',        icon: '⚙' },
  { to: '/activity', label: 'Activity Log', icon: '📊' },
];

export default function Layout() {
  const { profile, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [logoUrl,     setLogoUrl]     = useState(null);

  // Load logo from settings
  useEffect(() => {
    supabase.from('pricing_settings').select('value').eq('key', 'company_logo_url').single()
      .then(({ data }) => { if (data?.value) setLogoUrl(data.value); });
  }, []);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    const count = lastSeen
      ? changelog.filter(r => r.version > lastSeen).length
      : changelog.length;
    setUnreadCount(count);
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const navStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500,
    textDecoration: 'none', transition: 'background 0.12s',
    background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
    color: isActive ? 'white' : '#94a3b8',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ background: '#0f1e3c', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, height: 48, flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Company Logo"
              style={{ height: 28, maxWidth: 120, objectFit: 'contain', display: 'block' }} />
          ) : (
            <>
              <div style={{ width: 22, height: 22, background: '#2563eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>F</span>
              </div>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>FerrumIT</span>
              <span style={{ color: '#475569', fontSize: 10 }}>Pricing</span>
            </>
          )}
        </div>

        {/* New Quote dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNewMenuOpen(o => !o)} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
            background: '#2563eb', border: 'none', borderRadius: 5, color: 'white',
            fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}>
            + New Quote ▾
          </button>
          {newMenuOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 0', minWidth: 200, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <button onClick={() => { navigate('/'); setNewMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', fontSize: 12, color: '#374151', cursor: 'pointer', display: 'block' }}>
                <div style={{ fontWeight: 600 }}>🖥 Managed IT</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>Workstation, user, and cyber security</div>
              </button>
              <button onClick={() => { navigate('/voice'); setNewMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', fontSize: 12, color: '#374151', cursor: 'pointer', display: 'block' }}>
                <div style={{ fontWeight: 600 }}>📞 Hosted Voice</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>VoIP seats, SIP trunking, hybrid hosting</div>
              </button>
              <div style={{ height: 1, background: '#f3f4f6', margin: '2px 0' }}/>
              <button onClick={() => { navigate('/bundle'); setNewMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', fontSize: 12, color: '#374151', cursor: 'pointer', display: 'block' }}>
                <div style={{ fontWeight: 600 }}>📦 Bundle Quote</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>Managed IT + Voice with bundle discount</div>
              </button>
            </div>
          )}
        </div>

        {/* Nav links */}
        {[...NAV, ...(isAdmin ? ADMIN_NAV : [])].map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end style={({ isActive }) => navStyle(isActive)}>
            <span>{icon}</span> {label}
          </NavLink>
        ))}

        {/* What's New */}
        <NavLink to="/changelog" style={({ isActive }) => navStyle(isActive)} onClick={() => setUnreadCount(0)}>
          <span>🆕</span> What's New
          {unreadCount > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, background: '#2563eb', color: 'white', padding: '1px 5px', borderRadius: 8, marginLeft: 2 }}>
              {unreadCount}
            </span>
          )}
        </NavLink>

        <div style={{ flex: 1 }} />

        {/* User menu */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
            background: 'transparent', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 11
          }}>
            <span style={{ width: 20, height: 20, background: '#2563eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700 }}>
              {profile?.full_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || '?'}
            </span>
            {profile?.full_name || profile?.email?.split('@')[0]}
            {isAdmin && <span style={{ fontSize: 9, background: '#1e40af', color: '#bfdbfe', padding: '1px 4px', borderRadius: 3 }}>admin</span>}
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 0', minWidth: 160, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '6px 12px', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{profile?.email}</div>
              <button onClick={handleSignOut} style={{ width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}

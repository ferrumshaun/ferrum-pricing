import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmt$0, fmtPct, gmColor, gmBg } from '../lib/pricing';

const STATUS_STYLE = {
  draft:     { bg: '#f3f4f6', color: '#6b7280' },
  in_review: { bg: '#fef3c7', color: '#92400e' },
  approved:  { bg: '#dcfce7', color: '#166534' },
  sent:      { bg: '#dbeafe', color: '#1e40af' },
  won:       { bg: '#dcfce7', color: '#166534' },
  lost:      { bg: '#fee2e2', color: '#991b1b' },
  expired:   { bg: '#fef3c7', color: '#92400e' },
};

// ─── Quote type taxonomy ──────────────────────────────────────────────────────
// Single source of truth for tag colors, labels, and edit routes.
// Order matters: more specific types must be checked before generic ones
// (Multi-Site before Bundle, Bundle before Voice, etc.). Defaults to Managed IT.
const QUOTE_TYPES = {
  flexIT:    { label: 'FlexIT',    bg: '#f97316', color: 'white', route: q => `/flexIT/${q.id}` },
  multisite: { label: 'Multi-Site',bg: '#0f766e', color: 'white', route: q => `/multisite/${q.id}` },
  bundle:    { label: 'Bundle',    bg: '#6d28d9', color: 'white', route: q => `/bundle/${q.id}` },
  voice:     { label: 'Voice',     bg: '#7c3aed', color: 'white', route: q => `/voice/${q.id}` },
  it:        { label: 'IT',        bg: '#2563eb', color: 'white', route: q => `/quotes/${q.id}` },
};

function classifyQuote(q) {
  if (q.quote_type === 'flexIT' || q.package_name === 'FlexIT On-Demand') return 'flexIT';
  if (q.package_name?.startsWith('Multi-Site')) return 'multisite';
  if (q.package_name?.startsWith('Bundle'))     return 'bundle';
  if (q.package_name?.startsWith('Voice'))      return 'voice';
  return 'it';
}

export default function QuotesPage() {
  const [quotes,  setQuotes]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    let q = supabase.from('quotes').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (search) q = q.ilike('client_name', `%${search}%`);
    const { data } = await q.limit(100);
    setQuotes(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [search, status]);

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Saved Quotes</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>All team quotes — searchable and shareable</p>
        </div>
        <div style={{ position:'relative' }}>
          <button onClick={() => setShowNewMenu(v => !v)}
            style={{ padding:'6px 14px', background:'#0f1e3c', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            + New Quote ▾
          </button>
          {showNewMenu && (
            <>
              <div onClick={() => setShowNewMenu(false)} style={{ position:'fixed', inset:0, zIndex:99 }}/>
              <div style={{ position:'absolute', right:0, top:'calc(100% + 4px)', background:'white', border:'1px solid #e5e7eb', borderRadius:6, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', zIndex:100, minWidth:210, overflow:'hidden' }}>
                {[
                  { label:'🖥  Managed IT',       path:'/',             badge:'IT',        color:'#2563eb' },
                  { label:'📞  Hosted Voice',      path:'/voice/new',    badge:'Voice',     color:'#7c3aed' },
                  { label:'📦  Bundle (IT + Voice)',path:'/bundle/new',  badge:'Bundle',    color:'#6d28d9' },
                  { label:'📍  Multi-Location IT',  path:'/multisite/new',badge:'Multi',   color:'#0f766e' },
                  { label:'⚡  FlexIT On-Demand',  path:'/flexIT/new',   badge:'FlexIT',   color:'#f97316' },
                ].map(({ label, path, badge, color }) => (
                  <div key={path} onClick={() => { navigate(path); setShowNewMenu(false); }}
                    style={{ padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    <span style={{ fontSize:12, color:'#374151' }}>{label}</span>
                    <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3, background: color + '18', color }}>{badge}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by client name..."
          style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none' }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, background: 'white' }}>
          <option value="">All types</option>
          <option value="it">Managed IT</option>
          <option value="voice">Voice</option>
          <option value="bundle">Bundle</option>
          <option value="multisite">Multi-Site</option>
          <option value="flexIT">FlexIT</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, background: 'white' }}>
          <option value="">All statuses</option>
          {['draft','in_review','approved','sent','won','lost','expired'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? <div style={{ padding: 20, color: '#6b7280', fontSize: 12 }}>Loading...</div> : (
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Quote #','Client','Package','Market','MRR','GM','Onboarding','Status','Created','HubSpot'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No quotes found. Create your first quote above.</td></tr>
              )}
              {quotes.filter(q => !typeFilter || classifyQuote(q) === typeFilter).map((q, i) => {
                const totals = q.totals || {};
                const gm = totals.impliedGM || totals.gm || 0;
                // Voice quotes save totals.nrc; IT/Bundle/FlexIT/MultiSite save totals.onboarding.
                // Fall back so the column reflects the right one-time value for every quote type.
                const onboarding = totals.onboarding ?? totals.nrc ?? 0;
                const ss = STATUS_STYLE[q.status] || STATUS_STYLE.draft;
                const typeKey = classifyQuote(q);
                const tt = QUOTE_TYPES[typeKey];
                return (
                  <tr key={q.id} onClick={() => navigate(tt.route(q))} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}>
                    <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#1e40af', fontWeight: 600 }}>{q.quote_number}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f1e3c' }}>
                      <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:9, fontWeight:700, background:tt.bg, color:tt.color, padding:'2px 7px', borderRadius:3, letterSpacing:'.02em', textTransform:'uppercase', flexShrink:0, minWidth:46, textAlign:'center' }}>{tt.label}</span>
                        <span>{q.client_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#374151' }}>{q.package_name}</td>
                    <td style={{ padding: '8px 10px', color: '#6b7280' }}>{q.market_tier?.replace('_', ' ')}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#0f1e3c' }}>{fmt$0(totals.finalMRR)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 11, fontWeight: 700, background: gmBg(gm), color: gmColor(gm), fontFamily: 'DM Mono, monospace' }}>
                        {fmtPct(gm)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$0(onboarding)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: ss.bg, color: ss.color }}>{q.status}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: 11 }}>{new Date(q.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {q.hubspot_deal_url
                        ? <a href={q.hubspot_deal_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            style={{ fontSize: 10, color: '#f97316', fontWeight: 600 }}>View Deal →</a>
                        : <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

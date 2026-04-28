import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmt$0, fmtPct, gmColor, gmBg } from '../lib/pricing';
import { dealUrlFor } from '../lib/hubspot';

const STATUS_STYLE = {
  draft:     { bg: '#f3f4f6', color: '#6b7280' },
  in_review: { bg: '#fef3c7', color: '#92400e' },
  approved:  { bg: '#dcfce7', color: '#166534' },
  sent:      { bg: '#dbeafe', color: '#1e40af' },
  won:       { bg: '#dcfce7', color: '#166534' },
  lost:      { bg: '#fee2e2', color: '#991b1b' },
  expired:   { bg: '#fef3c7', color: '#92400e' },
};

export default function QuotesPage() {
  const [quotes,  setQuotes]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState('');
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
              {quotes.map((q, i) => {
                const totals = q.totals || {};
                const gm = totals.impliedGM || totals.gm || 0;
                const ss = STATUS_STYLE[q.status] || STATUS_STYLE.draft;
                const isFlexIT    = q.quote_type === 'flexIT' || q.package_name === 'FlexIT On-Demand';
                const isVoice     = !isFlexIT && q.package_name?.startsWith('Voice');
                const isBundle    = !isFlexIT && q.package_name?.startsWith('Bundle');
                const isMultiSite = !isFlexIT && q.package_name?.startsWith('Multi-Site');
                return (
                  <tr key={q.id} onClick={() => navigate(isFlexIT ? `/flexIT/${q.id}` : isMultiSite ? `/multisite/${q.id}` : isBundle ? `/bundle/${q.id}` : isVoice ? `/voice/${q.id}` : `/quotes/${q.id}`)} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}>
                    <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#1e40af', fontWeight: 600 }}>{q.quote_number}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f1e3c' }}>
                      {q.client_name}
                      {isFlexIT && <span style={{ marginLeft:5, fontSize:9, background:'#f97316', color:'white', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>FlexIT</span>}
                      {isMultiSite && <span style={{ marginLeft:5, fontSize:9, background:'#6d28d9', color:'white', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>Multi-Site</span>}
                      {isBundle && !isMultiSite && <span style={{ marginLeft:5, fontSize:9, background:'linear-gradient(135deg,#2563eb,#7c3aed)', color:'white', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>Bundle</span>}
                      {isVoice && !isBundle && <span style={{ marginLeft:5, fontSize:9, background:'#7c3aed', color:'white', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>Voice</span>}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#374151' }}>{q.package_name}</td>
                    <td style={{ padding: '8px 10px', color: '#6b7280' }}>{q.market_tier?.replace('_', ' ')}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#0f1e3c' }}>{fmt$0(totals.finalMRR)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 11, fontWeight: 700, background: gmBg(gm), color: gmColor(gm), fontFamily: 'DM Mono, monospace' }}>
                        {fmtPct(gm)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$0(totals.onboarding)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: ss.bg, color: ss.color }}>{q.status}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: 11 }}>{new Date(q.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {/*
                        Render the View Deal link whenever the quote has a
                        hubspot_deal_id, even if hubspot_deal_url wasn't
                        captured at connect time (which happened to some
                        older quotes — the proxy occasionally returned a deal
                        without a dealUrl field, and the front-end persisted
                        an empty string). The URL is derived from the deal id
                        as a fallback.
                      */}
                      {(q.hubspot_deal_url || q.hubspot_deal_id)
                        ? <a href={q.hubspot_deal_url || dealUrlFor(q.hubspot_deal_id)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
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

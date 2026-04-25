import React, { useState } from 'react';
import { searchDeals, getDealFull, updateDeal } from '../lib/hubspot';
import { logActivity } from '../lib/supabase';

// ── HubSpotConnect ─────────────────────────────────────────────────────────
// Props:
//   dealId, dealUrl, dealName        — current connected deal state
//   description                       — deal description / notes field
//   quoteNumber, mrr, contractValue,  — for Sync to HubSpot
//   packageName, contractTerm
//   onConnect(full)                   — called with full getDealFull response
//   onDisconnect()                    — called when deal is cleared
//   onDescriptionChange(v)            — called when description changes
//   onSync()                          — optional override for sync
//   existingQuoteId                   — for activity logging
//   clientName                        — for activity logging

export default function HubSpotConnect({
  dealId, dealUrl, dealName,
  description, onDescriptionChange,
  quoteNumber, mrr, contractValue, packageName, contractTerm,
  onConnect, onDisconnect,
  onSync,
  existingQuoteId, clientName,
}) {
  const [open,      setOpen]      = useState(false);
  const [search,    setSearch]    = useState('');
  const [results,   setResults]   = useState([]);
  const [msg,       setMsg]       = useState('');
  const [loading,   setLoading]   = useState(false);
  const [syncing,   setSyncing]   = useState(false);
  const [expanded,  setExpanded]  = useState(!!dealId);

  async function doSearch() {
    setLoading(true); setMsg(''); setResults([]);
    try {
      const res = await searchDeals(search);
      setResults(res);
      if (!res.length) setMsg('No open deals found.');
    } catch (e) { setMsg('✗ ' + e.message); }
    setLoading(false);
  }

  async function doConnect(deal) {
    setLoading(true); setMsg('Fetching deal info...');
    try {
      const full = await getDealFull(deal.id);
      setMsg(`✓ Connected: ${full.deal.dealname}`);
      setResults([]);
      setOpen(false);
      setExpanded(true);
      await logActivity({
        action: 'HUBSPOT_CONNECT', entityType: 'quote',
        entityId: existingQuoteId, entityName: clientName,
        changes: { deal_id: full.dealId, deal_name: full.deal.dealname }
      });
      onConnect?.(full);
    } catch (e) { setMsg('✗ ' + e.message); }
    setLoading(false);
  }

  async function doSync() {
    if (onSync) { onSync(); return; }
    if (!dealId || !mrr) return;
    setSyncing(true);
    try {
      await updateDeal(dealId, {
        mrr, contractValue, packageName,
        quoteNumber: quoteNumber || 'DRAFT',
        contractTerm,
      });
      setMsg('✓ Deal updated in HubSpot');
      await logActivity({ action: 'HUBSPOT_SYNC', entityType: 'quote', entityId: existingQuoteId, entityName: clientName });
    } catch (e) { setMsg('✗ ' + e.message); }
    setSyncing(false);
  }

  function disconnect() {
    setMsg('');
    setExpanded(false);
    onDisconnect?.();
  }

  const msgColor = msg.startsWith('✓') ? '#166534'
    : msg.startsWith('⚠') ? '#92400e'
    : msg.startsWith('Fetching') || msg.startsWith('Pulling') ? '#1e40af'
    : '#dc2626';

  return (
    <>
      {/* ── Panel ── */}
      <div style={{
        background: dealId ? '#fff7ed' : '#f8fafc',
        border: `1px solid ${dealId ? '#fed7aa' : '#e5e7eb'}`,
        borderRadius: 6, marginBottom: 10, overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:18, height:18, background:'#ff7a59', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ color:'white', fontSize:10, fontWeight:700 }}>H</span>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color: dealId ? '#c2410c' : '#6b7280', lineHeight:1.2 }}>
                {dealId ? (dealName || `Deal #${dealId}`) : 'Not connected to HubSpot'}
              </div>
              {dealId && (
                <div style={{ fontSize:9, color:'#9ca3af' }}>HubSpot CRM</div>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
            {dealId && (
              <>
                <a href={dealUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize:10, color:'#c2410c', fontWeight:600, textDecoration:'none' }}>
                  View →
                </a>
                <button onClick={doSync} disabled={syncing}
                  style={{ fontSize:10, padding:'2px 7px', background:'#dcfce7', color:'#166534', border:'none', borderRadius:3, cursor:'pointer', fontWeight:600 }}>
                  {syncing ? '...' : 'Sync'}
                </button>
                <button onClick={() => setExpanded(e => !e)}
                  style={{ fontSize:10, padding:'2px 6px', background:'white', border:'1px solid #e5e7eb', borderRadius:3, cursor:'pointer', color:'#6b7280' }}>
                  {expanded ? '▲' : '▼'}
                </button>
                <button onClick={disconnect}
                  style={{ fontSize:10, color:'#dc2626', background:'none', border:'none', cursor:'pointer', padding:'0 2px' }}>✕</button>
              </>
            )}
            <button onClick={() => { setOpen(true); setMsg(''); setResults([]); setSearch(''); }}
              style={{ fontSize:10, padding:'3px 8px', background:'#0f1e3c', color:'white', border:'none', borderRadius:3, cursor:'pointer', fontWeight:600 }}>
              {dealId ? 'Change' : 'Connect Deal'}
            </button>
          </div>
        </div>

        {/* Expandable: description + deal details */}
        {dealId && expanded && (
          <div style={{ borderTop:'1px solid #fed7aa', padding:'8px 10px' }}>
            <label style={{ display:'block', fontSize:9, fontWeight:600, color:'#374151', marginBottom:3 }}>
              Deal Description / Information
              <span style={{ fontWeight:400, color:'#9ca3af', marginLeft:4 }}>(syncs to HubSpot on save)</span>
            </label>
            <textarea
              value={description || ''}
              onChange={e => onDescriptionChange?.(e.target.value)}
              rows={3}
              placeholder="Add context about this deal — competitive situation, key stakeholders, etc."
              style={{ width:'100%', padding:'5px 7px', border:'1px solid #fde68a', borderRadius:4, fontSize:10, resize:'vertical', outline:'none', lineHeight:1.5, background:'white' }}
            />
          </div>
        )}

        {/* Status message */}
        {msg && (
          <div style={{ padding:'5px 10px', borderTop:'1px solid #f1f5f9', fontSize:10, fontWeight:500, color: msgColor }}>
            {msg}
          </div>
        )}
      </div>

      {/* ── Search Modal ── */}
      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
          <div style={{ background:'white', borderRadius:10, padding:24, width:500, maxHeight:'75vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:24, height:24, background:'#ff7a59', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ color:'white', fontSize:13, fontWeight:700 }}>H</span>
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f1e3c' }}>Connect HubSpot Deal</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', fontSize:20, color:'#6b7280', cursor:'pointer' }}>×</button>
            </div>

            <div style={{ display:'flex', gap:5, marginBottom:8 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="Search by client or deal name..."
                autoFocus
                style={{ flex:1, padding:'7px 9px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none' }}
              />
              <button onClick={doSearch} disabled={loading}
                style={{ padding:'7px 14px', background:'#ff7a59', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? '...' : 'Search'}
              </button>
            </div>

            {msg && !msg.startsWith('✓') && (
              <div style={{ fontSize:11, color:'#6b7280', marginBottom:6 }}>{msg}</div>
            )}

            <div style={{ overflowY:'auto', flex:1, borderRadius:5, border: results.length ? '1px solid #e5e7eb' : 'none' }}>
              {results.map(d => (
                <div key={d.id} onClick={() => doConnect(d)}
                  style={{ padding:'10px 12px', cursor:'pointer', borderBottom:'1px solid #f3f4f6' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#0f1e3c' }}>{d.properties.dealname}</div>
                  <div style={{ display:'flex', gap:8, marginTop:2 }}>
                    <span style={{ fontSize:10, color:'#6b7280' }}>{d.properties.dealstage_label || d.properties.dealstage}</span>
                    {d.properties.amount && (
                      <span style={{ fontSize:10, color:'#9ca3af' }}>
                        ${parseFloat(d.properties.amount).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ padding:16, textAlign:'center', color:'#9ca3af', fontSize:12 }}>
                  Searching HubSpot...
                </div>
              )}
            </div>

            <div style={{ marginTop:10, fontSize:10, color:'#9ca3af', textAlign:'center' }}>
              Only open deals are shown. Closed/Won and Closed/Lost deals are excluded.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

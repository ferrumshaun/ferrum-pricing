import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ── SPTConnect ────────────────────────────────────────────────────────────────
// Props:
//   proposalId, proposalName          — current linked SPT proposal state
//   quoteId                           — for saving link to DB
//   clientName                        — default search term + new proposal name
//   quoteNumber                       — included in new proposal name
//   settings                          — pricing_settings (for spt_api_key)
//   quoteTypeLabel                    — phrase used in the auto-generated proposal
//                                       name. Defaults to "Managed IT Services".
//                                       FlexIT passes "On-Demand IT Support".
//   customCreate({ sptApiKey, name }) — optional. When provided, doCreate calls
//                                       this instead of the built-in minimal
//                                       createProposal. Should return the raw
//                                       proxy response (object containing the
//                                       new proposal id at .id, .proposal.id,
//                                       or .proposal_id). FlexIT passes a
//                                       function that calls
//                                       createFlexITSPTProposal so the new
//                                       proposal includes the FlexIT cover,
//                                       billing, rate card, and payment pages.
//   onConnect(id, name, url)          — called when proposal is linked
//   onDisconnect()                    — called when unlinked

export default function SPTConnect({
  proposalId,
  proposalName,
  quoteId,
  clientName,
  quoteNumber,
  settings,
  quoteTypeLabel,
  customCreate,
  onConnect,
  onDisconnect,
}) {
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState('search'); // 'search' | 'create'
  const [search,     setSearch]     = useState('');
  const [results,    setResults]    = useState([]);
  const [msg,        setMsg]        = useState('');
  const [loading,    setLoading]    = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState('');
  const [expanded,   setExpanded]   = useState(false);
  const [fetchedName,setFetchedName]= useState(proposalName || '');

  const sptKey = settings?.spt_api_key || '';
  const proposalUrl = proposalId
    ? `https://web.smartpricingtable.com/proposals/${proposalId}`
    : null;

  // Auto-fill new proposal name
  useEffect(() => {
    const label = quoteTypeLabel || 'Managed IT Services';
    setNewName(`${clientName || 'Client'} — ${label}${quoteNumber ? ` (${quoteNumber})` : ''}`);
  }, [clientName, quoteNumber, quoteTypeLabel]);

  // Fetch proposal name from SPT if we have ID but no name
  useEffect(() => {
    if (!proposalId || fetchedName || !sptKey) return;
    fetch('/.netlify/functions/sptProxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getProposal', payload: { proposalId }, sptApiKey: sptKey }),
    })
      .then(r => r.json())
      .then(d => { if (d.name) setFetchedName(d.name); })
      .catch(() => {});
  }, [proposalId, sptKey]);

  async function doSearch() {
    if (!sptKey) { setMsg('⚠ SPT API key not set — add it in Admin → Integrations'); return; }
    setLoading(true); setMsg(''); setResults([]);
    try {
      const res = await fetch('/.netlify/functions/sptProxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'listProposals',
          payload: { search: search || clientName || '', limit: 30 },
          sptApiKey: sptKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      const list = data.data || [];
      setResults(list);
      if (!list.length) setMsg('No proposals found.');
    } catch (e) { setMsg('✗ ' + e.message); }
    setLoading(false);
  }

  async function doLink(proposal) {
    const name = proposal.name;
    const url  = `https://web.smartpricingtable.com/proposals/${proposal.id}`;
    setMsg(`✓ Linked: ${name}`);
    setResults([]);
    setOpen(false);
    setFetchedName(name);
    setExpanded(true);
    if (quoteId) {
      await supabase.from('quotes').update({
        spt_proposal_id: proposal.id,
        spt_synced_at: new Date().toISOString(),
      }).eq('id', quoteId);
    }
    onConnect?.(proposal.id, name, url);
  }

  async function doCreate() {
    if (!sptKey) { setMsg('⚠ SPT API key not set — add it in Admin → Integrations'); return; }
    if (!newName.trim()) return;
    setCreating(true); setMsg('Creating proposal in Smart Pricing Table...');
    try {
      let data;
      if (typeof customCreate === 'function') {
        // Quote-type-specific structured proposal builder. FlexIT uses this so
        // the proposal includes the cover, billing, market-adjusted rate card,
        // payment schedule, and acceptance terms — not just an empty shell.
        data = await customCreate({ sptApiKey: sptKey, name: newName.trim() });
      } else {
        // Default: minimal create (just name + recipient name).
        const res = await fetch('/.netlify/functions/sptProxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'createProposal',
            payload: {
              name: newName.trim(),
              settings: {
                recipient: {
                  name: clientName || '',
                },
              },
              tags: ['ferrum-iq'],
            },
            sptApiKey: sptKey,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Create failed');
      }

      // SPT's response shape can vary by endpoint and proxy version: top-level
      // id, nested proposal.id, snake-cased proposal_id, or under data. Try
      // every plausible path before giving up — otherwise reps see "No
      // proposal ID returned" even though the proposal was actually created.
      const pid = data?.id
        || data?.proposal?.id
        || data?.proposal_id
        || data?.data?.id
        || data?.data?.proposal?.id;
      if (!pid) throw new Error('No proposal ID returned');
      const url = `https://web.smartpricingtable.com/proposals/${pid}`;
      setMsg(`✓ Created: ${newName.trim()}`);
      setOpen(false);
      setFetchedName(newName.trim());
      setExpanded(true);
      if (quoteId) {
        await supabase.from('quotes').update({
          spt_proposal_id: pid,
          spt_synced_at: new Date().toISOString(),
        }).eq('id', quoteId);
      }
      onConnect?.(pid, newName.trim(), url);
    } catch (e) { setMsg('✗ ' + e.message); }
    setCreating(false);
  }

  function doDisconnect() {
    setFetchedName('');
    setMsg('');
    setExpanded(false);
    if (quoteId) {
      supabase.from('quotes').update({ spt_proposal_id: null, spt_synced_at: null }).eq('id', quoteId);
    }
    onDisconnect?.();
  }

  function openModal(initialMode = 'search') {
    setMode(initialMode);
    setOpen(true);
    setMsg('');
    setResults([]);
    setSearch(clientName || '');
  }

  const displayName = fetchedName || proposalName || (proposalId ? `Proposal ${proposalId.slice(0, 8)}...` : '');
  const msgColor = msg.startsWith('✓') ? '#166534'
    : msg.startsWith('⚠') ? '#92400e'
    : msg.startsWith('Creating') ? '#1e40af'
    : '#dc2626';

  return (
    <>
      {/* ── Panel ── */}
      <div style={{
        background: proposalId ? '#fff7ed' : '#f8fafc',
        border: `1px solid ${proposalId ? '#fed7aa' : '#e5e7eb'}`,
        borderRadius: 6, marginBottom: 10, overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0, flex:1 }}>
            <div style={{ width:18, height:18, background:'#2563eb', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ color:'white', fontSize:10, fontWeight:700 }}>S</span>
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color: proposalId ? '#c2410c' : '#6b7280', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {proposalId ? (displayName || 'SPT Proposal Linked') : 'Not linked to Smart Pricing Table'}
              </div>
              {proposalId && (
                <div style={{ fontSize:9, color:'#9ca3af' }}>Smart Pricing Table</div>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
            {proposalId && (
              <>
                <a href={proposalUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize:10, color:'#c2410c', fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>
                  Open →
                </a>
                <button onClick={() => setExpanded(e => !e)}
                  style={{ fontSize:10, padding:'2px 6px', background:'white', border:'1px solid #e5e7eb', borderRadius:3, cursor:'pointer', color:'#6b7280' }}>
                  {expanded ? '▲' : '▼'}
                </button>
                <button onClick={doDisconnect}
                  style={{ fontSize:10, color:'#dc2626', background:'none', border:'none', cursor:'pointer', padding:'0 2px' }}>✕</button>
              </>
            )}
            <button onClick={() => openModal('search')}
              style={{ fontSize:10, padding:'3px 8px', background:'#2563eb', color:'white', border:'none', borderRadius:3, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
              {proposalId ? 'Change' : 'Link / Create'}
            </button>
          </div>
        </div>

        {/* Expanded: quick actions */}
        {proposalId && expanded && (
          <div style={{ borderTop:'1px solid #fed7aa', padding:'8px 10px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <a href={proposalUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:10, padding:'3px 10px', background:'#2563eb', color:'white', borderRadius:3, textDecoration:'none', fontWeight:600 }}>
              Open in Smart Pricing Table →
            </a>
            <button onClick={() => openModal('search')}
              style={{ fontSize:10, padding:'3px 8px', background:'white', border:'1px solid #e5e7eb', borderRadius:3, cursor:'pointer', color:'#374151' }}>
              🔍 Link Different Proposal
            </button>
            <div style={{ fontSize:9, color:'#9ca3af', flex:1, textAlign:'right' }}>
              {proposalId && `ID: ${proposalId.slice(0, 12)}...`}
            </div>
          </div>
        )}

        {/* Status message */}
        {msg && (
          <div style={{ padding:'5px 10px', borderTop:'1px solid #f1f5f9', fontSize:10, fontWeight:500, color: msgColor }}>
            {msg}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
          <div style={{ background:'white', borderRadius:10, padding:24, width:520, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>

            {/* Modal header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:26, height:26, background:'#2563eb', borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ color:'white', fontSize:14, fontWeight:700 }}>S</span>
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f1e3c' }}>Smart Pricing Table</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', fontSize:20, color:'#6b7280', cursor:'pointer' }}>×</button>
            </div>

            {/* Mode tabs */}
            <div style={{ display:'flex', gap:4, marginBottom:16, background:'#f3f4f6', borderRadius:6, padding:3 }}>
              {[
                { key:'search', label:'🔍  Link Existing' },
                { key:'create', label:'✚  Create New'    },
              ].map(tab => (
                <button key={tab.key} onClick={() => { setMode(tab.key); setMsg(''); }}
                  style={{ flex:1, padding:'6px 0', borderRadius:4, border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
                    background: mode === tab.key ? 'white' : 'transparent',
                    color: mode === tab.key ? '#0f1e3c' : '#6b7280',
                    boxShadow: mode === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Search mode ── */}
            {mode === 'search' && (
              <>
                <div style={{ display:'flex', gap:5, marginBottom:8 }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                    placeholder="Search by proposal name or client..."
                    autoFocus
                    style={{ flex:1, padding:'7px 9px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none' }}
                  />
                  <button onClick={doSearch} disabled={loading}
                    style={{ padding:'7px 14px', background:'#2563eb', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity: loading ? 0.6 : 1 }}>
                    {loading ? '...' : 'Search'}
                  </button>
                </div>

                {msg && (
                  <div style={{ fontSize:11, color: msg.startsWith('✗') ? '#dc2626' : '#6b7280', marginBottom:6 }}>{msg}</div>
                )}

                <div style={{ overflowY:'auto', flex:1, border: results.length ? '1px solid #e5e7eb' : 'none', borderRadius:5 }}>
                  {results.map(p => (
                    <div key={p.id} onClick={() => doLink(p)}
                      style={{ padding:'10px 12px', cursor:'pointer', borderBottom:'1px solid #f3f4f6' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'#0f1e3c', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>
                            {p.settings?.recipient?.name && <span>{p.settings.recipient.name} · </span>}
                            Updated {new Date(p.updated_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                            {p.created_by?.name && <span> · {p.created_by.name}</span>}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:3,
                            color: p.status === 'WON' ? '#166534' : p.status === 'SENT' ? '#1e40af' : p.status === 'LOST' ? '#991b1b' : '#6b7280',
                            background: p.status === 'WON' ? '#dcfce7' : p.status === 'SENT' ? '#dbeafe' : p.status === 'LOST' ? '#fee2e2' : '#f3f4f6',
                          }}>
                            {p.status}
                          </span>
                          <span style={{ fontSize:11, color:'#2563eb', fontWeight:600 }}>Link →</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div style={{ padding:16, textAlign:'center', color:'#9ca3af', fontSize:12 }}>
                      Searching Smart Pricing Table...
                    </div>
                  )}
                  {!loading && !results.length && !msg && (
                    <div style={{ padding:20, textAlign:'center', color:'#9ca3af', fontSize:12 }}>
                      Search for an existing SPT proposal to link it to this quote.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Create mode ── */}
            {mode === 'create' && (
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'#6b7280', marginBottom:14, lineHeight:1.6 }}>
                  Creates a new proposal in Smart Pricing Table and links it to this quote.
                  Open it in SPT to add pricing pages and content.
                </div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#374151', marginBottom:4 }}>
                  Proposal Name
                </label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none', marginBottom:14 }}
                />
                {msg && (
                  <div style={{ fontSize:11, fontWeight:600, color: msgColor, marginBottom:10 }}>{msg}</div>
                )}
                <button onClick={doCreate} disabled={creating || !newName.trim() || !sptKey}
                  style={{ width:'100%', padding:'10px', background: sptKey ? '#2563eb' : '#9ca3af', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor: (creating || !newName.trim() || !sptKey) ? 'not-allowed' : 'pointer' }}>
                  {creating ? 'Creating...' : '✚ Create Proposal in SPT'}
                </button>
                {!sptKey && (
                  <div style={{ fontSize:10, color:'#dc2626', marginTop:6, textAlign:'center' }}>
                    SPT API key required — add it in Admin → Integrations
                  </div>
                )}
                <div style={{ fontSize:9, color:'#9ca3af', marginTop:8, textAlign:'center', lineHeight:1.5 }}>
                  After creating, click "Open in SPT" to add pricing tables and send to the client.
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}

import React, { useState } from 'react';
import { buildRateSheet, fmtRate } from '../lib/rateSheet';
import { supabase } from '../lib/supabase';
import { createSPTProposal } from '../lib/smartPricingTable';
import StripePaymentCard from './StripePaymentCard';

// ── Section colors ────────────────────────────────────────────────────────────
const SECTION_COLORS = {
  remote:     { bg: '#0f1e3c', text: 'white' },
  dev:        { bg: '#0f1e3c', text: 'white' },
  onsite:     { bg: '#0f1e3c', text: 'white' },
  afterhours: { bg: '#0f1e3c', text: 'white' },
};

// ── RateSheetModal ────────────────────────────────────────────────────────────
export default function RateSheetModal({
  onClose,
  analysis,         // market analysis for this quote/location
  settings,         // pricing settings
  clientName,
  recipientContact,
  recipientAddress,
  quoteId,
  quoteNumber,
  sptProposalId,
  onSPTLinked,      // callback(proposalId, proposalUrl) when linked/created
}) {
  const [exporting,   setExporting]   = useState(false);
  const [exportMsg,   setExportMsg]   = useState('');
  const [sptKey,      setSptKey]      = useState(settings?.spt_api_key || '');
  const [showKeyInput,setShowKeyInput]= useState(false);
  const [proposalUrl, setProposalUrl] = useState(null);

  const rateSheet = buildRateSheet({
    analysis, settings, clientName, recipientContact,
  });

  const { meta } = rateSheet;

  async function exportToSPT() {
    const key = sptKey || settings?.spt_api_key;
    if (!key) { setShowKeyInput(true); return; }

    setExporting(true); setExportMsg('Creating proposal in Smart Pricing Table...');
    try {
      const proposalName = `${clientName || 'Client'} — Out-of-Scope Rate Schedule`;
      const result = await createSPTProposal({ rateSheet, quote: { quoteId, quoteNumber }, proposalName, sptApiKey: key });

      const pid = result.id || result.data?.id;
      const url = pid ? `https://web.smartpricingtable.com/proposals/${pid}` : null;

      // Save SPT proposal ID to quote
      if (quoteId && pid) {
        await supabase.from('quotes').update({ spt_proposal_id: pid, spt_synced_at: new Date().toISOString() }).eq('id', quoteId);
        onSPTLinked?.(pid, url);
      }

      setProposalUrl(url);
      setExportMsg(`✓ Created in Smart Pricing Table${url ? '' : ' — check your SPT account'}`);
    } catch (e) {
      setExportMsg(`✗ ${e.message}`);
    }
    setExporting(false);
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'stretch', justifyContent:'flex-end', zIndex:600 }}>
      {/* Click outside to close */}
      <div style={{ flex:1 }} onClick={onClose} />

      {/* Drawer */}
      <div style={{ width:640, background:'white', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)', overflowY:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#0f1e3c', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>Out-of-Scope Rate Schedule</div>
            <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>
              {clientName || 'Client'}{meta.city ? ` · ${meta.city}, ${meta.state}` : ''} · {meta.tier} market
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        {/* SPT connect bar */}
        <SPTConnectBar
          sptProposalId={sptProposalId}
          sptApiKey={sptKey || settings?.spt_api_key}
          exporting={exporting}
          exportMsg={exportMsg}
          proposalUrl={proposalUrl}
          clientName={clientName}
          onExportNew={exportToSPT}
          onLink={(pid, url) => {
            setProposalUrl(url);
            setExportMsg(`✓ Linked: ${pid}`);
            onSPTLinked?.(pid, url);
          }}
          onUnlink={() => { setProposalUrl(null); setExportMsg(''); onSPTLinked?.(null, null); }}
        />

        {/* Rate sheet content */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

          {/* Intro */}
          <div style={{ marginBottom:20 }}>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#0f1e3c', margin:'0 0 10px' }}>
              Rates for Out-of-Scope Services
            </h1>
            <p style={{ fontSize:12, color:'#374151', lineHeight:1.7, margin:0 }}>
              Services outside the scope of this Agreement shall be billed at the applicable hourly rates
              corresponding to the type of service provided, as outlined in the Provider's current rate
              schedule below. Rates may vary by service category. Written approval is required prior to
              the initiation of such services.
            </p>
            {meta.city && (
              <div style={{ marginTop:8, padding:'6px 10px', background:'#eff6ff', borderRadius:4, fontSize:10, color:'#1e40af', display:'inline-block' }}>
                📍 Rates shown for {meta.city}, {meta.state} ({meta.tier} market · {meta.mult}× multiplier)
              </div>
            )}
          </div>

          {/* Sections */}
          {rateSheet.sections.map(section => (
            <div key={section.id} style={{ marginBottom:24 }}>
              {/* Section header */}
              <div style={{ background:'#0f1e3c', borderRadius:5, padding:'8px 16px', textAlign:'center', marginBottom:10 }}>
                <span style={{ fontSize:14, fontWeight:700, color:'white' }}>{section.title}</span>
              </div>

              {/* Section note */}
              {section.note && (
                <p style={{ fontSize:11, color:'#6b7280', lineHeight:1.6, margin:'0 0 10px', fontStyle:'italic' }}>
                  {section.note}
                </p>
              )}

              {/* Rate table */}
              <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #e5e7eb', borderRadius:4, overflow:'hidden' }}>
                <tbody>
                  {section.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: i < section.items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'#374151', width:'55%', borderRight:'1px solid #f1f5f9' }}>
                        {item.service}
                      </td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'#0f1e3c', fontWeight:500, fontFamily: item.rate !== null ? 'DM Mono, monospace' : 'inherit' }}>
                        {fmtRate(item)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div style={{ borderTop:'1px solid #e5e7eb', paddingTop:14, fontSize:10, color:'#9ca3af', lineHeight:1.6 }}>
            Rates effective as of {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
            Market-adjusted rates based on {meta.city ? `${meta.city}, ${meta.state}` : 'your service area'}.
            All rates subject to change with 30 days written notice.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DocumentsPanel ── small panel shown on quote pages ───────────────────────
export function DocumentsPanel({
  analysis, settings, clientName, recipientContact,
  quoteId, quoteNumber, sptProposalId, onSPTLinked,
  // Assumptions props
  inputs, pkg, products, complianceKey,
  // Payment schedule props
  result, obIncentive,
  // Stripe prepayment props
  quoteType,           // 'managed-it' | 'multi-site-managed-it' | 'bundle' | 'flex' | 'voice'
  clientEmail,
  prepayAmount,        // dollars — pulled from result.onboarding or equivalent
  hubspotDealId,
}) {
  const [showRateSheet,    setShowRateSheet]    = useState(false);
  const [showAssumptions,  setShowAssumptions]  = useState(false);
  const [showPaymentSched, setShowPaymentSched] = useState(false);
  const [assumptionsSaved, setAssumptionsSaved] = useState(false);

  // Check if assumptions have been saved
  useState(() => {
    if (inputs?.assumptions?.savedAt) setAssumptionsSaved(true);
  }, [inputs?.assumptions]);

  const docs = [
    {
      id: 'rate_sheet',
      icon: '💲',
      title: 'Out-of-Scope Rate Schedule',
      sub: sptProposalId ? 'Linked to Smart Pricing Table' : 'Market-adjusted rates · link or create in SPT',
      badge: sptProposalId ? 'SPT ✓' : null,
      badgeColor: '#166534', badgeBg: '#dcfce7',
      onClick: () => setShowRateSheet(true),
      label: sptProposalId ? 'View / Update' : 'View / Export',
    },
    {
      id: 'assumptions',
      icon: '📋',
      title: 'Assumptions & Exclusions',
      sub: assumptionsSaved || inputs?.assumptions?.savedAt ? 'Discovery notes saved · ready to export' : 'Capture discovery notes and scope boundaries',
      badge: inputs?.assumptions?.savedAt ? 'Saved ✓' : null,
      badgeColor: '#0f766e', badgeBg: '#ccfbf1',
      onClick: () => setShowAssumptions(true),
      label: 'Open',
    },
    {
      id: 'payment',
      icon: '💳',
      title: 'Payment Schedule',
      sub: result ? `${inputs?.contractTerm || 24}-month schedule · ${obIncentive?.mode && obIncentive.mode !== 'none' ? 'incentive applied' : 'standard billing'}` : 'Save quote first',
      badge: null,
      onClick: () => result && setShowPaymentSched(true),
      label: 'View',
      disabled: !result,
    },
  ];

  return (
    <>
      <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:'10px 12px', marginBottom:10 }}>
        <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#6b7280', marginBottom:8 }}>
          📄 Documents
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'#f8fafc', borderRadius:4, border:`1px solid ${doc.badge ? '#e0fdf4' : '#e5e7eb'}`, opacity: doc.disabled ? 0.5 : 1 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ fontSize:11 }}>{doc.icon}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:'#0f1e3c' }}>{doc.title}</span>
                  {doc.badge && (
                    <span style={{ fontSize:8, fontWeight:700, color:doc.badgeColor, background:doc.badgeBg, padding:'1px 5px', borderRadius:3 }}>
                      {doc.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:9, color:'#9ca3af', marginTop:1, paddingLeft:16 }}>{doc.sub}</div>
              </div>
              <button onClick={doc.onClick} disabled={doc.disabled}
                style={{ padding:'4px 10px', background: doc.disabled ? '#f3f4f6' : '#0f1e3c', color: doc.disabled ? '#9ca3af' : 'white', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor: doc.disabled ? 'not-allowed' : 'pointer', flexShrink:0 }}>
                {doc.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Stripe prepayment card — only shows when the quote has a prepayment */}
      {prepayAmount > 0 && (
        <StripePaymentCard
          quoteId={quoteId}
          quoteType={quoteType || 'managed-it'}
          quoteNumber={quoteNumber}
          clientName={clientName}
          clientEmail={clientEmail}
          recipientContact={recipientContact}
          prepayAmount={prepayAmount}
          hubspotDealId={hubspotDealId}
        />
      )}

      {showRateSheet && (
        <RateSheetModal
          onClose={() => setShowRateSheet(false)}
          analysis={analysis}
          settings={settings}
          clientName={clientName}
          recipientContact={recipientContact}
          quoteId={quoteId}
          quoteNumber={quoteNumber}
          sptProposalId={sptProposalId}
          onSPTLinked={(pid, url) => {
            onSPTLinked?.(pid, url);
            if (!pid && quoteId) supabase.from('quotes').update({ spt_proposal_id: null, spt_synced_at: null }).eq('id', quoteId);
          }}
        />
      )}

      {showAssumptions && (
        <AssumptionsModalLazy
          onClose={() => setShowAssumptions(false)}
          quoteId={quoteId} quoteNumber={quoteNumber}
          clientName={clientName} recipientContact={recipientContact}
          inputs={inputs} pkg={pkg} products={products}
          complianceKey={complianceKey}
          onSave={() => setAssumptionsSaved(true)}
        />
      )}

      {showPaymentSched && result && (
        <PaymentScheduleModalLazy
          onClose={() => setShowPaymentSched(false)}
          quoteId={quoteId} quoteNumber={quoteNumber}
          clientName={clientName}
          result={result} obIncentive={obIncentive}
          inputs={inputs} settings={settings}
        />
      )}
    </>
  );
}

// Lazy load the modals to keep initial bundle size down
function AssumptionsModalLazy(props) {
  const [Comp, setComp] = useState(null);
  useState(() => { import('./AssumptionsModal').then(m => setComp(() => m.default)); }, []);
  if (!Comp) return null;
  return <Comp {...props} />;
}
function PaymentScheduleModalLazy(props) {
  const [Comp, setComp] = useState(null);
  useState(() => { import('./PaymentScheduleModal').then(m => setComp(() => m.default)); }, []);
  if (!Comp) return null;
  return <Comp {...props} />;
}


// ── SPTConnectBar ─────────────────────────────────────────────────────────────
// Compact bar shown inside the rate sheet drawer — handles link/unlink/create/view
function SPTConnectBar({ sptProposalId, sptApiKey, exporting, exportMsg, proposalUrl, clientName, onExportNew, onLink, onUnlink }) {
  const [showSearch, setShowSearch] = useState(false);

  const hasKey = !!sptApiKey;

  return (
    <>
      <div style={{ background:'#f8fafc', borderBottom:'1px solid #e5e7eb', padding:'10px 20px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

          {/* Status */}
          <div style={{ flex:1, minWidth:0 }}>
            {sptProposalId ? (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, color:'#166534', fontWeight:600 }}>
                  ✓ Linked to SPT proposal
                </span>
                {proposalUrl && (
                  <a href={proposalUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize:10, color:'#f97316', fontWeight:600, textDecoration:'none' }}>
                    Open in SPT →
                  </a>
                )}
                <button onClick={() => {
                  if (window.confirm('Unlink this SPT proposal? The proposal will remain in SPT but will no longer be associated with this quote.')) {
                    onUnlink?.();
                  }
                }} style={{ fontSize:9, color:'#6b7280', background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'underline' }}>
                  Unlink
                </button>
              </div>
            ) : (
              <div style={{ fontSize:11, color:'#6b7280' }}>
                Not linked to Smart Pricing Table
              </div>
            )}
            {exportMsg && (
              <div style={{ fontSize:10, fontWeight:600, color: exportMsg.startsWith('✓') ? '#166534' : '#dc2626', marginTop:2 }}>
                {exportMsg}
              </div>
            )}
            {!hasKey && (
              <div style={{ fontSize:9, color:'#dc2626', marginTop:2 }}>
                ⚠ SPT API key not configured — add it in Admin → Integrations
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {/* Search & link existing */}
            <button onClick={() => setShowSearch(true)} disabled={!hasKey}
              style={{ padding:'6px 12px', background:'white', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontWeight:600, color:'#374151', cursor: hasKey ? 'pointer' : 'not-allowed', opacity: hasKey ? 1 : 0.5 }}>
              🔍 Link Existing
            </button>
            {/* Create new */}
            <button onClick={onExportNew} disabled={exporting || !hasKey}
              style={{ padding:'6px 12px', background: hasKey ? '#f97316' : '#9ca3af', color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:700, cursor: (exporting || !hasKey) ? 'not-allowed' : 'pointer' }}>
              {exporting ? 'Creating...' : sptProposalId ? '↻ Push Update' : '+ Create New'}
            </button>
          </div>
        </div>
      </div>

      {showSearch && (
        <SPTSearchModal
          sptApiKey={sptApiKey}
          clientName={clientName}
          onSelect={(proposal) => {
            const url = `https://web.smartpricingtable.com/proposals/${proposal.id}`;
            onLink?.(proposal.id, url);
            setShowSearch(false);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </>
  );
}

// ── SPTSearchModal ────────────────────────────────────────────────────────────
// Search existing SPT proposals and link one to this quote
function SPTSearchModal({ sptApiKey, clientName, onSelect, onClose }) {
  const [search,   setSearch]   = useState(clientName || '');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState('');
  const [searched, setSearched] = useState(false);

  async function doSearch() {
    if (!search.trim()) return;
    setLoading(true); setMsg(''); setResults([]);
    try {
      const res = await fetch('/.netlify/functions/sptProxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listProposals', payload: { search: search.trim(), limit: 30 }, sptApiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      const proposals = data.data || [];
      setResults(proposals);
      setMsg(proposals.length === 0 ? 'No proposals found.' : '');
      setSearched(true);
    } catch (e) {
      setMsg('✗ ' + e.message);
    }
    setLoading(false);
  }

  // Auto-search on open with client name
  useState(() => { if (clientName) doSearch(); }, []);

  const statusColor = (s) => ({
    DRAFT: '#6b7280', SENT: '#2563eb', PENDING: '#d97706',
    WON: '#166534', LOST: '#dc2626', CANCELLED: '#9ca3af', EXPIRED: '#9ca3af',
  }[s] || '#6b7280');

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:700 }}>
      <div style={{ background:'white', borderRadius:10, padding:24, width:540, maxHeight:'75vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, background:'#f97316', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ color:'white', fontSize:12, fontWeight:700 }}>S</span>
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'#0f1e3c' }}>Link Existing SPT Proposal</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, color:'#6b7280', cursor:'pointer' }}>×</button>
        </div>

        {/* Search input */}
        <div style={{ display:'flex', gap:6, marginBottom:10 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search by proposal name or client..."
            autoFocus
            style={{ flex:1, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none' }}
          />
          <button onClick={doSearch} disabled={loading}
            style={{ padding:'8px 14px', background:'#f97316', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? '...' : 'Search'}
          </button>
        </div>

        {msg && <div style={{ fontSize:11, color: msg.startsWith('✗') ? '#dc2626' : '#6b7280', marginBottom:8 }}>{msg}</div>}

        {/* Results */}
        <div style={{ flex:1, overflowY:'auto', border:'1px solid #e5e7eb', borderRadius:6 }}>
          {!searched && !loading && (
            <div style={{ padding:20, textAlign:'center', color:'#9ca3af', fontSize:12 }}>
              Search for an existing SPT proposal to link to this quote.<br/>
              <span style={{ fontSize:11 }}>Searching by client name will show the most relevant proposals.</span>
            </div>
          )}
          {results.map(p => (
            <div key={p.id} onClick={() => onSelect(p)}
              style={{ padding:'10px 14px', borderBottom:'1px solid #f3f4f6', cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fef3e7'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#0f1e3c', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>
                    {p.settings?.recipient?.name && <span>{p.settings.recipient.name} · </span>}
                    Updated {new Date(p.updated_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    {p.created_by?.name && <span> · {p.created_by.name}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  <span style={{ fontSize:9, fontWeight:700, color: statusColor(p.status), background: statusColor(p.status) + '18', padding:'2px 6px', borderRadius:3 }}>
                    {p.status}
                  </span>
                  <span style={{ fontSize:11, color:'#f97316', fontWeight:600 }}>Link →</span>
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ padding:20, textAlign:'center', color:'#9ca3af', fontSize:12 }}>Searching Smart Pricing Table...</div>
          )}
        </div>

        <div style={{ marginTop:10, fontSize:10, color:'#9ca3af', textAlign:'center' }}>
          Select a proposal to link it to this Ferrum IQ quote. The proposal itself won't be modified.
        </div>
      </div>
    </div>
  );
}

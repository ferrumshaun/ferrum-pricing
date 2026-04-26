import React, { useState } from 'react';
import { buildRateSheet, fmtRate } from '../lib/rateSheet';
import { createSPTProposal } from '../lib/smartPricingTable';
import { supabase } from '../lib/supabase';

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
              {meta.area2 && <span style={{ marginLeft:6, background:'#dc2626', color:'white', fontSize:9, padding:'1px 5px', borderRadius:2, fontWeight:700 }}>AREA 2 +{meta.area2SurchargePct}%</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        {/* SPT export bar */}
        <div style={{ background:'#f8fafc', borderBottom:'1px solid #e5e7eb', padding:'10px 20px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div style={{ flex:1 }}>
              {sptProposalId ? (
                <div style={{ fontSize:11, color:'#166534', fontWeight:600 }}>
                  ✓ Linked to SPT proposal
                  {proposalUrl && <a href={proposalUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft:8, color:'#2563eb', fontSize:10 }}>View in SPT →</a>}
                </div>
              ) : (
                <div style={{ fontSize:11, color:'#6b7280' }}>Not yet exported to Smart Pricing Table</div>
              )}
              {exportMsg && (
                <div style={{ fontSize:11, fontWeight:600, color: exportMsg.startsWith('✓') ? '#166534' : '#dc2626', marginTop:2 }}>
                  {exportMsg}
                  {proposalUrl && <a href={proposalUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft:8, color:'#2563eb', fontWeight:400 }}>Open in SPT →</a>}
                </div>
              )}
            </div>
            <button onClick={exportToSPT} disabled={exporting}
              style={{ padding:'7px 16px', background: exporting ? '#9ca3af' : '#f97316', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor: exporting ? 'default' : 'pointer', whiteSpace:'nowrap' }}>
              {exporting ? 'Exporting...' : sptProposalId ? '↻ Re-export to SPT' : '↗ Export to Smart Pricing Table'}
            </button>
          </div>

          {showKeyInput && (
            <div style={{ marginTop:8, display:'flex', gap:6 }}>
              <input value={sptKey} onChange={e => setSptKey(e.target.value)}
                placeholder="Paste your SPT API key..."
                style={{ flex:1, padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none', fontFamily:'DM Mono, monospace' }} />
              <button onClick={() => { setShowKeyInput(false); exportToSPT(); }}
                style={{ padding:'5px 12px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, cursor:'pointer' }}>
                Use Key
              </button>
              <div style={{ fontSize:9, color:'#9ca3af', alignSelf:'center' }}>
                Save permanently in Admin → Integrations
              </div>
            </div>
          )}
        </div>

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
                {meta.area2 && ` · Area 2 +${meta.area2SurchargePct}% surcharge applied`}
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

          {/* Area 2 note */}
          {!meta.area2 && (
            <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:5, padding:'10px 14px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#92400e', marginBottom:6 }}>
                Metropolitan / Extended Area Coverage — Area 2 Surcharge (+{meta.area2SurchargePct}%)
              </div>
              <div style={{ fontSize:10, color:'#78350f', lineHeight:1.6 }}>
                A {meta.area2SurchargePct}% surcharge applies to all charges for work performed in the following locations:
                Alaska (all cities) · California (San Francisco metro, Oakland, San Jose, Palo Alto area) ·
                Hawaii (all cities) · Nevada (Las Vegas) · New York (NYC metro and boroughs) ·
                Washington (Seattle, Mercer Island) · Canada (AB, BC, MB, ON, QC, SK)
              </div>
            </div>
          )}

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
}) {
  const [showRateSheet, setShowRateSheet] = useState(false);

  return (
    <>
      <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:'10px 12px', marginBottom:10 }}>
        <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#6b7280', marginBottom:8 }}>
          📄 Documents
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {/* Rate Sheet */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'#f8fafc', borderRadius:4, border:'1px solid #e5e7eb' }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#0f1e3c' }}>Out-of-Scope Rate Schedule</div>
              <div style={{ fontSize:9, color:'#9ca3af' }}>
                {sptProposalId ? '✓ Exported to SPT' : 'Market-adjusted · ready to export'}
              </div>
            </div>
            <button onClick={() => setShowRateSheet(true)}
              style={{ padding:'4px 10px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer' }}>
              View / Export
            </button>
          </div>

          {/* Placeholder for future documents */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'#f8fafc', borderRadius:4, border:'1px dashed #d1d5db' }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#9ca3af' }}>Assumptions & Scope</div>
              <div style={{ fontSize:9, color:'#d1d5db' }}>Coming soon</div>
            </div>
            <button disabled style={{ padding:'4px 10px', background:'#f3f4f6', color:'#d1d5db', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor:'not-allowed' }}>
              View / Export
            </button>
          </div>
        </div>
      </div>

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
          onSPTLinked={onSPTLinked}
        />
      )}
    </>
  );
}

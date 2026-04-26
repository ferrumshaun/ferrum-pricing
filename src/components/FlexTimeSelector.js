import React, { useState } from 'react';
import {
  FLEX_BLOCKS,
  calcFlexBlock,
  calcAllFlexBlocks,
  FLEX_MANAGED_TERMS,
  FLEX_ONDEMAND_TERMS,
  TIER3_EXCLUSION,
} from '../lib/flexTime';

const fmt$2 = n => `$${Number(n).toFixed(2)}`;
const fmt$0 = n => `$${Math.round(n).toLocaleString('en-US')}`;

// ── FlexTimeSelector ─────────────────────────────────────────────────────────
// mode: 'managed'  — monthly recurring add-on (IT quotes)
//       'ondemand' — pre-purchase annual block (FlexIT quotes)
//
// Props:
//   remoteRate       — market-adjusted hourly T&M rate
//   settings         — pricing_settings
//   selectedHours    — currently selected block size (null = none)
//   onChange(hours)  — called with selected hours (or null to clear)
//   mode             — 'managed' | 'ondemand'
//   packageModel     — 'none' | 'included' | 'required' | 'all_inclusive'
//   includedMinsPerWS— included minutes per workstation (when model='included')
//   workstations     — workstation count (for included time calc)

export default function FlexTimeSelector({
  remoteRate = 165,
  settings,
  selectedHours,
  onChange,
  mode = 'managed',
  packageModel = 'none',
  includedMinsPerWS = 0,
  workstations = 0,
}) {
  const [showTerms, setShowTerms] = useState(false);

  const blocks = calcAllFlexBlocks(remoteRate, settings);
  const isOnDemand = mode === 'ondemand';
  const isAllInclusive = packageModel === 'all_inclusive';
  const includedHrs = includedMinsPerWS > 0 ? Math.round((includedMinsPerWS * workstations) / 60 * 10) / 10 : 0;

  if (isAllInclusive) {
    return (
      <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6, padding:'10px 12px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#166534', marginBottom:2 }}>✓ All-Inclusive Time</div>
        <div style={{ fontSize:10, color:'#16a34a' }}>
          This package includes unlimited Tier 1/2 remote support. Onsite and Tier 2 specialist dispatch billed separately.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ background:'#0f1e3c', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'white' }}>
            {isOnDemand ? '⚡ Flex Time Block — Pre-Purchase' : '⏱ Flex Time Add-On'}
          </div>
          <div style={{ fontSize:9, color:'#64748b', marginTop:1 }}>
            {isOnDemand
              ? 'Tier 1/2 labor · valid 12 months · refillable at original rate'
              : 'Tier 1/2 onsite & SME labor · monthly recurring · no rollover'}
          </div>
        </div>
        {packageModel === 'required' && !isOnDemand && (
          <span style={{ fontSize:9, fontWeight:700, color:'#fde68a', background:'rgba(255,255,255,0.1)', padding:'2px 6px', borderRadius:3 }}>
            REQUIRED
          </span>
        )}
      </div>

      <div style={{ padding:'10px 12px' }}>
        {/* Included time note */}
        {packageModel === 'included' && includedHrs > 0 && !isOnDemand && (
          <div style={{ fontSize:9, color:'#0f766e', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:4, padding:'4px 8px', marginBottom:8 }}>
            ℹ Package includes {includedMinsPerWS} min/WS/mo ({includedHrs} hrs at {workstations} WS).
            Select a block to add additional pooled time.
          </div>
        )}

        {/* Block selector grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6, marginBottom:8 }}>
          {blocks.map(block => {
            const selected = selectedHours === block.hours;
            return (
              <button key={block.hours} onClick={() => onChange(selected ? null : block.hours)}
                style={{
                  padding:'8px 4px', borderRadius:5, cursor:'pointer', textAlign:'center',
                  border: `2px solid ${selected ? '#f97316' : '#e5e7eb'}`,
                  background: selected ? '#fff7ed' : 'white',
                  transition: 'all 0.1s',
                }}>
                <div style={{ fontSize:14, fontWeight:700, color: selected ? '#c2410c' : '#0f1e3c' }}>
                  {block.hours}
                </div>
                <div style={{ fontSize:8, color:'#6b7280', marginBottom:2 }}>hours</div>
                <div style={{ fontSize:10, fontFamily:'DM Mono, monospace', fontWeight:700, color: selected ? '#c2410c' : '#374151' }}>
                  {fmt$0(block.blockPrice)}
                </div>
                <div style={{ fontSize:8, color:'#16a34a', fontWeight:600 }}>
                  -{block.discountPct}%
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected block detail */}
        {selectedHours && (() => {
          const b = calcFlexBlock(selectedHours, remoteRate, settings);
          return (
            <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:5, padding:'10px 12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#c2410c' }}>
                    {b.label} — {b.hours} Hours
                  </div>
                  <div style={{ fontSize:10, color:'#9a3412', marginTop:2 }}>
                    {isOnDemand
                      ? `One-time purchase · valid 12 months from purchase date`
                      : `Monthly recurring · refreshes every month · no rollover`}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                  <div style={{ fontSize:15, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#c2410c' }}>
                    {fmt$2(b.blockPrice)}
                  </div>
                  <div style={{ fontSize:9, color:'#9ca3af' }}>
                    {isOnDemand ? 'per block' : '/mo'}
                  </div>
                  <div style={{ fontSize:9, color:'#16a34a', fontWeight:600 }}>
                    Save {fmt$2(b.savings)} vs T&M
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:8 }}>
                {[
                  ['Effective Rate', `${fmt$2(b.ratePerHr)}/hr`],
                  ['T&M Rate',       `${fmt$2(remoteRate)}/hr`],
                  ['Your Savings',   `${b.discountPct}% off`],
                ].map(([l,v]) => (
                  <div key={l} style={{ background:'white', borderRadius:4, padding:'5px 7px', textAlign:'center', border:'1px solid #fed7aa' }}>
                    <div style={{ fontSize:8, color:'#9ca3af', marginBottom:1 }}>{l}</div>
                    <div style={{ fontSize:11, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#374151' }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Terms */}
              <div style={{ fontSize:9, color:'#9a3412', lineHeight:1.5, marginBottom:6 }}>
                {isOnDemand ? (
                  <>
                    Block valid for <strong>12 months</strong> from purchase. May be refilled at any time at the
                    original agreed rate. If not refilled within <strong>30 days</strong> of depletion or expiration,
                    a new quote at then-current rates will be required.
                  </>
                ) : (
                  <>
                    Time refreshes at the start of each calendar month. Unused hours do not carry over
                    and are not refundable.
                  </>
                )}
              </div>

              <button onClick={() => setShowTerms(t => !t)}
                style={{ fontSize:9, color:'#c2410c', background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'underline' }}>
                {showTerms ? 'Hide full terms' : 'View full terms & Tier 3 exclusions'}
              </button>

              {showTerms && (
                <div style={{ marginTop:8, padding:'8px 10px', background:'white', borderRadius:4, border:'1px solid #fed7aa' }}>
                  <div style={{ fontSize:9, color:'#374151', lineHeight:1.7, marginBottom:6 }}>
                    {isOnDemand ? FLEX_ONDEMAND_TERMS : FLEX_MANAGED_TERMS}
                  </div>
                  <div style={{ fontSize:9, color:'#dc2626', lineHeight:1.6, marginTop:6, fontStyle:'italic' }}>
                    <strong>Tier 3 exclusion:</strong> {TIER3_EXCLUSION}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Tier 3 note */}
        <div style={{ marginTop:8, fontSize:9, color:'#6b7280', lineHeight:1.5, borderTop:'1px solid #f3f4f6', paddingTop:6 }}>
          <strong>Tier 3 / Senior Technical</strong> (network design, server projects, firewall deployment, migrations, DR, security audits)
          is bid separately at the Tier 3 rate and is not eligible for block time pooling.
        </div>
      </div>
    </div>
  );
}

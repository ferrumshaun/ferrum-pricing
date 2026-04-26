import React from 'react';

// ── FlexTimeMeter ─────────────────────────────────────────────────────────────
// Shows included flex time from package + purchased addon block time
// with a two-tone progress bar (blue = included, orange = addon)
//
// Props:
//   pkg           — selected package object (flex_minutes_per_ws, flex_label, flex_time_model)
//   workstations  — WS count (for included time calculation)
//   users         — user count (fallback if WS=0)
//   addonHours    — hours purchased via FlexTimeSelector (null = none)

export default function FlexTimeMeter({ pkg, workstations, users, addonHours }) {
  const fmins   = pkg?.flex_minutes_per_ws ?? 0;
  const flabel  = pkg?.flex_label || 'Flex Time (Onsite / Tier 2 Support)';
  const ws      = workstations || users || 0;
  const model   = pkg?.flex_time_model || 'none';

  // Unlimited package
  if (fmins === -1 || model === 'all_inclusive') {
    return (
      <div style={{ marginBottom:10, padding:'10px 14px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#166534' }}>∞ Unlimited {flabel}</div>
          <div style={{ fontSize:10, color:'#16a34a', marginTop:1 }}>Included with this package — no cap on onsite or escalated support time</div>
        </div>
        <div style={{ background:'#166534', color:'white', fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:5, flexShrink:0 }}>Unlimited</div>
      </div>
    );
  }

  const includedMins = fmins > 0 ? ws * fmins : 0;
  const includedHrs  = includedMins / 60;
  const addonHrs     = addonHours || 0;
  const totalHrs     = includedHrs + addonHrs;

  const fmtHrs = h => h % 1 === 0 ? h : h.toFixed(1);

  // Reference max for bar scaling: 2 hrs/WS or 40 hrs minimum
  const barMax = Math.max(ws * 2, 40, totalHrs * 1.1);
  const includedPct = Math.min((includedHrs / barMax) * 100, 100);
  const addonPct    = Math.min((addonHrs  / barMax) * 100, 100 - includedPct);

  // Not included + no addon → show "By Request"
  if (includedMins === 0 && addonHrs === 0) {
    return (
      <div style={{ marginBottom:10, padding:'10px 14px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7280' }}>{flabel}</div>
          <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>Not included — available by request or purchase a block below</div>
        </div>
        <div style={{ background:'#f3f4f6', color:'#6b7280', fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:5, flexShrink:0, border:'1px solid #e5e7eb' }}>By Request</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom:10, padding:'12px 14px', background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:7 }}>
      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#1e40af' }}>{flabel}</div>
          {includedHrs > 0 && (
            <div style={{ fontSize:10, color:'#3b82f6', marginTop:1 }}>
              {ws} WS × {fmins} min = <strong>{fmtHrs(includedHrs)} hrs</strong> included · non-rollover
            </div>
          )}
          {addonHrs > 0 && (
            <div style={{ fontSize:10, color:'#f97316', marginTop:1 }}>
              + <strong>{fmtHrs(addonHrs)} hrs</strong> add-on block · monthly recurring
            </div>
          )}
          {fmins === 0 && addonHrs > 0 && (
            <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>Package has no included time · add-on block only</div>
          )}
        </div>
        <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
          <div style={{ fontSize:20, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#1e40af', lineHeight:1 }}>
            {fmtHrs(totalHrs)}
          </div>
          <div style={{ fontSize:9, color:'#3b82f6', fontWeight:600 }}>hrs / month total</div>
        </div>
      </div>

      {/* Two-tone progress bar */}
      <div style={{ height:8, background:'#dbeafe', borderRadius:4, overflow:'hidden', display:'flex' }}>
        {includedPct > 0 && (
          <div style={{ height:'100%', width:`${includedPct}%`, background:'#2563eb', borderRadius: addonPct > 0 ? '4px 0 0 4px' : 4, transition:'width 0.3s', flexShrink:0 }}/>
        )}
        {addonPct > 0 && (
          <div style={{ height:'100%', width:`${addonPct}%`, background:'#f97316', borderRadius: includedPct > 0 ? '0 4px 4px 0' : 4, transition:'width 0.3s', flexShrink:0 }}/>
        )}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, flexWrap:'wrap', gap:4 }}>
        <div style={{ display:'flex', gap:10 }}>
          {includedHrs > 0 && (
            <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:9, color:'#3b82f6' }}>
              <span style={{ width:8, height:8, borderRadius:2, background:'#2563eb', display:'inline-block' }}/>
              {fmtHrs(includedHrs)} hrs included
            </span>
          )}
          {addonHrs > 0 && (
            <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:9, color:'#f97316', fontWeight:600 }}>
              <span style={{ width:8, height:8, borderRadius:2, background:'#f97316', display:'inline-block' }}/>
              {fmtHrs(addonHrs)} hrs add-on
            </span>
          )}
        </div>
        <span style={{ fontSize:9, color:'#93c5fd' }}>resets monthly · no rollover</span>
      </div>
    </div>
  );
}

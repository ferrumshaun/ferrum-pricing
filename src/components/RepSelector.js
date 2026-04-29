// RepSelector — shared "Assigned Sales Rep" dropdown for quote pages.
//
// Extracted v3.5.26 from the 5 quote pages (Managed IT, Multi-Site, Voice,
// Bundle, FlexIT). The dropdown itself is small but it's the field that's
// moved most often (e.g. v3.5.20 stripped a commission rate display from all
// 5 places at once). Centralizing it means future tweaks happen in one file.
//
// What's intentionally NOT extracted: the surrounding <Fld> wrapper. Each
// page has its own field-spacing conventions; the wrapper stays per-page.

import React from 'react';

/**
 * Required props:
 *   repId          — currently-selected rep id (or null/'')
 *   setRepId       — setter that takes the new id
 *   teamMembers    — array of { id, full_name?, email } from the profiles table
 *
 * Optional props:
 *   fontSize       — px (default: 11). QuotePage and MultiSite use 10
 *   padding        — CSS padding string (default: '4px 6px'). QuotePage uses '4px 7px'
 *   placeholder    — empty-state option text (default: '— select rep —')
 *   includeTextColor — pass false to omit color:'#374151' style. QuotePage and
 *                      MultiSite don't include it (default: true to match Voice/Bundle/FlexIT)
 */
export default function RepSelector({
  repId,
  setRepId,
  teamMembers = [],

  fontSize = 11,
  padding = '4px 6px',
  placeholder = '— select rep —',
  includeTextColor = true,
}) {
  const style = {
    width: '100%',
    padding,
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize,
    background: 'white',
    outline: 'none',
  };
  if (includeTextColor) style.color = '#374151';

  return (
    <select value={repId || ''} onChange={e => setRepId(e.target.value)} style={style}>
      <option value="">{placeholder}</option>
      {teamMembers.map(m => (
        <option key={m.id} value={m.id}>
          {m.full_name || m.email?.split('@')[0]}
        </option>
      ))}
    </select>
  );
}

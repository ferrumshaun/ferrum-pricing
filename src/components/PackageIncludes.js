// PackageIncludes — shared component rendering the "Included with [Package]"
// section on quote pages. Used by QuotePage and MultiSiteQuotePage.
//
// Added v3.5.31. Shows each bundled product with $0/mo sell line. Mandatory
// includes are locked; swappable includes have a checkbox the rep can use to
// remove the product from this quote (skipping both sell and cost).
//
// Props:
//   packageName        — string, used in the heading ("Included with Essentials")
//   includes           — array from loadPackageIncludes()
//   excludedIds        — array of include IDs the rep has unchecked
//   onToggleExclude    — (includeId) => void; called when rep checks/unchecks
//                        a swappable include
//   loading            — boolean; renders a "Loading…" line
//   includedItemsCost  — optional number; if provided, shows "Total cost: $X/mo"
//                        as a small footer (admin-visible margin info)
//   showCost           — boolean (default true). Set false to hide cost from rep view.

import React from 'react';

export default function PackageIncludes({
  packageName,
  includes = [],
  excludedIds = [],
  onToggleExclude,
  loading = false,
  includedItemsCost,
  showCost = true,
}) {
  if (loading) {
    return (
      <div style={{ padding: '10px 12px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6, fontSize: 11, color: '#9ca3af' }}>
        Loading included products…
      </div>
    );
  }
  if (!includes || includes.length === 0) return null;

  const excludedSet = new Set(excludedIds || []);

  return (
    <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        📦 Included with {packageName || 'package'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {includes.map(inc => {
          const excluded = excludedSet.has(inc.id);
          const lineColor = excluded ? '#9ca3af' : '#374151';
          const labelDecoration = excluded ? 'line-through' : 'none';

          return (
            <div key={inc.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 6px',
                background: excluded ? '#fafafa' : 'white',
                borderRadius: 3,
                border: excluded ? '1px dashed #e5e7eb' : '1px solid transparent',
              }}>
              {/* Mandatory: render a locked icon. Swappable: render a checkbox */}
              {inc.is_mandatory ? (
                <span title="Mandatory — cannot be removed"
                  style={{ fontSize: 11, color: '#7c3aed', width: 14, textAlign: 'center' }}>🔒</span>
              ) : (
                <input type="checkbox" checked={!excluded}
                  onChange={() => onToggleExclude && onToggleExclude(inc.id)}
                  title="Swappable — uncheck to remove from this quote"
                  style={{ accentColor: '#7c3aed', cursor: 'pointer' }} />
              )}
              <div style={{ flex: 1, fontSize: 11, color: lineColor, textDecoration: labelDecoration }}>
                <span style={{ fontWeight: 600 }}>{inc.product_name}</span>
                {inc.category && (
                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>
                    · {inc.category}
                  </span>
                )}
                {!inc.is_mandatory && !excluded && (
                  <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 6, fontStyle: 'italic' }}>
                    swappable
                  </span>
                )}
                {excluded && (
                  <span style={{ fontSize: 9, color: '#dc2626', marginLeft: 6, fontStyle: 'italic' }}>
                    excluded
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: lineColor, textDecoration: labelDecoration }}>
                $0.00/mo
              </div>
            </div>
          );
        })}
      </div>
      {showCost && typeof includedItemsCost === 'number' && includedItemsCost > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #e9d5ff', fontSize: 10, color: '#6d28d9', fontFamily: 'DM Mono, monospace' }}>
          Cost contribution to package: ${includedItemsCost.toFixed(2)}/mo
        </div>
      )}
    </div>
  );
}

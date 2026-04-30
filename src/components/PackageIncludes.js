// PackageIncludes — shared component rendering the "Included with [Package]"
// section on quote pages. Used by QuotePage and MultiSiteQuotePage.
//
// v3.5.31: initial — shows each bundled product with $0/mo sell line.
//          Mandatory includes are locked; swappable includes have a checkbox.
// v3.5.32: helper hint below excluded swappable rows pointing reps to the
//          add-on category for finding a substitute.
// v3.5.33: full swap-out feature. Swappable includes now have a "Swap" button
//          that opens a picker filtered to the same product category. Once
//          swapped, the row shows a third state ("swapped to [substitute]")
//          and the substitute is treated as a paid add-on by the pricing
//          engine via inputs.includeSwaps.
//
// Props:
//   packageName        — string, used in the heading ("Included with Essentials")
//   includes           — array from loadPackageIncludes()
//   excludedIds        — array of include IDs the rep has unchecked
//   onToggleExclude    — (includeId) => void
//   loading            — boolean; renders a "Loading…" line
//   includedItemsCost  — optional number; if provided, shows "Cost contribution"
//   showCost           — boolean (default true)
//   // v3.5.33 swap-related props
//   includeSwaps       — { [includeId]: substituteProductId } map
//   availableProducts  — products catalog for the swap picker (filtered to active)
//   onSwap             — (includeId, substituteProductId) => void
//   onUnswap           — (includeId) => void

import React, { useState } from 'react';

export default function PackageIncludes({
  packageName,
  includes = [],
  excludedIds = [],
  onToggleExclude,
  loading = false,
  includedItemsCost,
  showCost = true,
  includeSwaps = {},
  availableProducts = [],
  onSwap,
  onUnswap,
}) {
  const [pickerInclude, setPickerInclude] = useState(null); // include obj being swapped, or null

  if (loading) {
    return (
      <div style={{ padding: '10px 12px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6, fontSize: 11, color: '#9ca3af' }}>
        Loading included products…
      </div>
    );
  }
  if (!includes || includes.length === 0) return null;

  const excludedSet = new Set(excludedIds || []);

  // Lookup helper for substitute products
  const productById = Object.fromEntries((availableProducts || []).map(p => [p.id, p]));

  return (
    <>
      <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          📦 Included with {packageName || 'package'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {includes.map(inc => {
            const excluded = excludedSet.has(inc.id);
            const swapSubId = includeSwaps?.[inc.id];
            const swapSub = swapSubId ? productById[swapSubId] : null;
            // A row is "swapped" when there's a substitute mapping AND the include is excluded.
            // (The exclusion-required invariant is enforced by parent state — if it ever drifts,
            //  we still render the swap state because it's the more informative display.)
            const isSwapped = !!swapSub && excluded;

            // Three render states for swappable rows: active, excluded-no-swap, swapped
            // Mandatory rows are always rendered as active (no checkbox, no swap, no exclusion)

            return (
              <React.Fragment key={inc.id}>
                <PackageIncludeRow
                  inc={inc}
                  excluded={excluded}
                  isSwapped={isSwapped}
                  swapSub={swapSub}
                  onToggleExclude={onToggleExclude}
                  onOpenPicker={() => setPickerInclude(inc)}
                  onUnswap={onUnswap}
                />
                {/* Helper hint shown when excluded but NOT swapped (rep has unchecked but
                    not yet picked a substitute) — added v3.5.32, refined v3.5.33 */}
                {excluded && !isSwapped && inc.category && (
                  <div style={{
                    marginLeft: 24, marginTop: 2, marginBottom: 4,
                    padding: '4px 8px',
                    background: '#fefce8', border: '1px solid #fef08a', borderRadius: 3,
                    fontSize: 10, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 11 }}>💡</span>
                    <span>
                      Need a substitute? Browse <strong style={{ color: '#78350f' }}>{inc.category}</strong> in the add-ons section below, or click <em>Swap</em> to pick one inline.
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        {showCost && typeof includedItemsCost === 'number' && includedItemsCost > 0 && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #e9d5ff', fontSize: 10, color: '#6d28d9', fontFamily: 'DM Mono, monospace' }}>
            Cost contribution to package: ${includedItemsCost.toFixed(2)}/mo
          </div>
        )}
      </div>
      {/* Swap picker modal */}
      {pickerInclude && (
        <SwapPickerModal
          include={pickerInclude}
          products={availableProducts}
          currentSubstituteId={includeSwaps?.[pickerInclude.id] || null}
          onClose={() => setPickerInclude(null)}
          onPick={(substituteProductId) => {
            if (onSwap) onSwap(pickerInclude.id, substituteProductId);
            setPickerInclude(null);
          }}
        />
      )}
    </>
  );
}

// ─── Row renderer ────────────────────────────────────────────────────────────
function PackageIncludeRow({ inc, excluded, isSwapped, swapSub, onToggleExclude, onOpenPicker, onUnswap }) {
  const lineColor = (excluded && !isSwapped) ? '#9ca3af' : '#374151';
  const labelDecoration = (excluded && !isSwapped) ? 'line-through' : 'none';

  // Swapped state: distinct visual treatment so reps see "this is now Acronis, not Datto"
  if (isSwapped) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 6px',
        background: '#f5f3ff',
        borderRadius: 3,
        border: '1px solid #c4b5fd',
      }}>
        <span title="Swapped — substitute will bill as a paid add-on"
          style={{ fontSize: 12, color: '#7c3aed', width: 14, textAlign: 'center' }}>🔄</span>
        <div style={{ flex: 1, fontSize: 11, color: '#374151' }}>
          <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>{inc.product_name}</span>
          <span style={{ margin: '0 6px', color: '#7c3aed' }}>→</span>
          <span style={{ fontWeight: 600, color: '#6d28d9' }}>{swapSub.name}</span>
          <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 6, fontStyle: 'italic' }}>
            swapped · billed as add-on
          </span>
        </div>
        <button onClick={onOpenPicker} title="Choose a different substitute"
          style={{ padding: '3px 8px', background: 'white', border: '1px solid #c4b5fd', borderRadius: 3, fontSize: 10, color: '#6d28d9', cursor: 'pointer' }}>
          Change
        </button>
        <button onClick={() => onUnswap && onUnswap(inc.id)} title="Remove substitute (will revert to excluded with helper hint)"
          style={{ padding: '3px 6px', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>
          ✕
        </button>
      </div>
    );
  }

  // Active or excluded-no-swap state
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 6px',
        background: excluded ? '#fafafa' : 'white',
        borderRadius: 3,
        border: excluded ? '1px dashed #e5e7eb' : '1px solid transparent',
      }}>
      {inc.is_mandatory ? (
        <span title="Mandatory — cannot be removed"
          style={{ fontSize: 11, color: '#7c3aed', width: 14, textAlign: 'center' }}>🔒</span>
      ) : (
        <input type="checkbox" checked={!excluded}
          onChange={() => onToggleExclude && onToggleExclude(inc.id)}
          title="Swappable — uncheck to remove or click Swap to substitute"
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
      <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: lineColor, textDecoration: labelDecoration, marginRight: !inc.is_mandatory ? 4 : 0 }}>
        $0.00/mo
      </div>
      {/* Swap button — only on swappable rows. Allow opening from both active and excluded states. */}
      {!inc.is_mandatory && (
        <button onClick={onOpenPicker}
          title="Swap this for a different product (substitute will bill as a paid add-on)"
          style={{ padding: '3px 8px', background: 'white', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 10, color: '#6d28d9', cursor: 'pointer' }}>
          Swap ▾
        </button>
      )}
    </div>
  );
}

// ─── Swap picker modal ───────────────────────────────────────────────────────
// Filters available products to the same category as the include by default.
// Toggle "Show all categories" to see everything (rare cross-category swap).
function SwapPickerModal({ include, products, currentSubstituteId, onClose, onPick }) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const includeCategory = include.category;
  const includeCost = Number(include.cost_price) || 0;

  // Filter: same category by default, all categories if toggled, exclude the
  // original product (rep can't "swap" Datto for Datto), exclude inactive.
  const candidates = (products || []).filter(p => {
    if (p.id === include.product_id) return false;
    if (p.active === false) return false;
    if (!showAll && includeCategory && p.category !== includeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
      <div style={{ background: 'white', borderRadius: 8, padding: 20, width: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c', margin: 0 }}>Swap {include.product_name}</h3>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
              Pick a substitute. It will bill as a paid add-on at full sell price.
            </div>
          </div>
          <button onClick={onClose} title="Cancel"
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}>
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or description..."
            style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, outline: 'none' }} />
          <label style={{ fontSize: 10, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
              style={{ accentColor: '#7c3aed' }} />
            Show all categories
          </label>
        </div>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>
          {showAll
            ? <>Showing all categories.</>
            : <>Showing <strong style={{ color: '#374151' }}>{includeCategory || '(no category)'}</strong> only.</>
          }
          {' '}{candidates.length} candidate{candidates.length === 1 ? '' : 's'}.
        </div>
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}>
          {candidates.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
              No matching products. {!showAll && includeCategory && (
                <>Try <button onClick={() => setShowAll(true)}
                  style={{ background: 'none', border: 'none', color: '#6d28d9', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>
                  showing all categories
                </button>.</>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {candidates.map(p => {
                  const isCurrent = p.id === currentSubstituteId;
                  const subCost = Number(p.cost_price) || 0;
                  const costDelta = subCost - includeCost;
                  return (
                    <tr key={p.id} onClick={() => onPick(p.id)}
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: isCurrent ? '#faf5ff' : 'white' }}>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ fontWeight: 600, color: '#374151' }}>
                          {p.name}
                          {isCurrent && <span style={{ marginLeft: 6, fontSize: 9, color: '#7c3aed', fontStyle: 'italic' }}>current substitute</span>}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>
                          {p.category}{p.sub_category ? ` › ${p.sub_category}` : ''}{p.description ? ` — ${p.description.substring(0, 70)}${p.description.length > 70 ? '…' : ''}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'DM Mono, monospace', fontSize: 10, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <div style={{ color: '#0f766e' }}>${Number(p.sell_price).toFixed(2)}/{p.qty_driver}</div>
                        <div style={{ color: '#1e40af' }}>${subCost.toFixed(2)}/{p.cost_qty_driver || p.qty_driver}</div>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {/* Cost delta vs original include — admin-meaningful margin info */}
                        <div style={{ fontSize: 9, color: '#6b7280' }}>vs original cost:</div>
                        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600,
                          color: costDelta > 0 ? '#dc2626' : costDelta < 0 ? '#166534' : '#6b7280' }}>
                          {costDelta > 0 ? '+' : ''}${costDelta.toFixed(2)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button onClick={onClose}
            style={{ padding: '6px 14px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const SPLIT_TIERS = [
  { min: 500,  max: 750,   maxMonths: 3,  label: 'Up to 3 months' },
  { min: 750,  max: 1500,  maxMonths: 6,  label: 'Up to 6 months' },
  { min: 1500, max: Infinity, maxMonths: 12, label: 'Up to 12 months' },
];

const DISCOUNT_OPTIONS = [
  { value: 10,  label: '10% off' },
  { value: 20,  label: '20% off' },
  { value: 30,  label: '30% off' },
  { value: 50,  label: '50% off' },
  { value: 100, label: 'Full Waive' },
];

const LEGAL_NOTE = 'In the event of contract default, all onboarding incentives (split payments and/or discounts) are forfeited. The full undiscounted onboarding fee and remaining contract value are immediately recoverable per Section [X] of the Master Service Agreement.';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function getSplitTier(fee) {
  return SPLIT_TIERS.find(t => fee >= t.min && fee < t.max) || null;
}

// ── AI Recommendation logic ───────────────────────────────────────────────────
function getRecommendation(fee, marketTier, contractTerm) {
  if (!fee || fee <= 0) return null;

  // Premium markets — full price preferred, split acceptable for large fees
  if (marketTier === 'premium') {
    if (fee >= 1500) return { type: 'split', months: 6, reason: 'Premium market — split preferred over discount to protect full fee value' };
    return null; // No incentive needed in premium markets for smaller fees
  }

  // Standard markets — modest incentive to close
  if (marketTier === 'standard') {
    if (fee >= 1500) return { type: 'split', months: 6, reason: 'Large onboarding fee — split payments improve deal close rate in standard markets' };
    if (fee >= 750)  return { type: 'split', months: 3, reason: 'Mid-range fee — short split can help close without giving away discount' };
    return { type: 'discount', pct: 10, reason: 'Small fee — modest discount is cleaner than a payment plan' };
  }

  // Adjusted markets — more competitive, discounts more effective
  if (marketTier === 'adjusted') {
    if (fee >= 1500) return { type: 'split', months: 12, reason: 'Adjusted market — extended split protects revenue while easing cost concern' };
    if (fee >= 750)  return { type: 'discount', pct: 20, reason: 'Adjusted market — 20% discount is competitive and cost-effective to close' };
    return { type: 'discount', pct: 30, reason: 'Small fee in adjusted market — waive friction with 30% discount' };
  }

  // Secondary markets — most price sensitive
  if (marketTier === 'secondary') {
    if (fee >= 1500 && contractTerm >= 24) return { type: 'split', months: 12, reason: 'Long-term contract in secondary market — spread cost over contract term' };
    if (fee >= 1000) return { type: 'discount', pct: 30, reason: 'Secondary market — 30% discount recommended to stay competitive' };
    if (fee >= 750)  return { type: 'discount', pct: 50, reason: 'Secondary market — 50% discount can be the difference between winning and losing' };
    return { type: 'discount', pct: 100, reason: 'Small fee in secondary market — full waive removes all friction at minimal cost to FerrumIT' };
  }

  // Fallback — no market tier known
  if (fee >= 1500) return { type: 'split', months: 6, reason: 'Large onboarding fee — split payments recommended' };
  if (fee >= 750)  return { type: 'split', months: 3, reason: 'Split payment recommended' };
  return { type: 'discount', pct: 10, reason: 'Modest discount to help close' };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingIncentive({ fee, marketTier, contractTerm, onChange }) {
  const [mode,         setMode]         = useState(null);   // null | 'split' | 'discount'
  const [splitMonths,  setSplitMonths]  = useState(3);
  const [discountPct,  setDiscountPct]  = useState(10);
  const [accepted,     setAccepted]     = useState(false);
  const [showLegal,    setShowLegal]    = useState(false);
  const [dismissed,    setDismissed]    = useState(false);

  const recommendation = getRecommendation(fee, marketTier, contractTerm);
  const splitTier = getSplitTier(fee);

  // Reset when fee changes significantly
  useEffect(() => {
    setAccepted(false);
    setMode(null);
    setDismissed(false);
    onChange?.({ mode: null, effectiveFee: fee, monthlyAdd: 0 });
  }, [Math.round(fee / 50)]); // only reset on $50+ change

  // Emit calculated values on any change
  useEffect(() => {
    if (!mode || !accepted) {
      onChange?.({ mode: null, effectiveFee: fee, monthlyAdd: 0, discountPct: 0, splitMonths: 0 });
      return;
    }
    if (mode === 'split') {
      const monthlyAdd = parseFloat((fee / splitMonths).toFixed(2));
      onChange?.({ mode: 'split', effectiveFee: fee, monthlyAdd, splitMonths, discountPct: 0 });
    }
    if (mode === 'discount') {
      const effectiveFee = parseFloat((fee * (1 - discountPct / 100)).toFixed(2));
      onChange?.({ mode: 'discount', effectiveFee, monthlyAdd: 0, discountPct, splitMonths: 0, discountAmount: fee - effectiveFee });
    }
  }, [mode, accepted, splitMonths, discountPct, fee]);

  if (!fee || fee <= 0) return null;
  // Card stays visible always once shown — no permanent dismiss

  // ── Summary strip (accepted state) ────────────────────────────────────────
  if (accepted) {
    const summary = mode === 'split'
      ? `Split over ${splitMonths} months · +${fmt$(fee / splitMonths)}/mo`
      : `${discountPct === 100 ? 'Full Waive' : `${discountPct}% discount`} · ${fmt$(fee * (1 - discountPct / 100))} effective fee`;

    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12 }}>✓</span>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>Onboarding Incentive Applied</span>
              <span style={{ fontSize: 10, color: '#16a34a', marginLeft: 8 }}>{summary}</span>
            </div>
          </div>
          <button onClick={() => setAccepted(false)}
            style={{ fontSize: 9, padding: '2px 8px', background: 'white', border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', color: '#6b7280' }}>
            Modify
          </button>
        </div>
        <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>
          ⚖ Default recovery applies — <button onClick={() => setShowLegal(!showLegal)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 9, padding: 0, textDecoration: 'underline' }}>
            {showLegal ? 'hide' : 'view legal note'}
          </button>
        </div>
        {showLegal && (
          <div style={{ marginTop: 6, fontSize: 9, color: '#374151', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 4, padding: '6px 8px', lineHeight: 1.5 }}>
            {LEGAL_NOTE}
          </div>
        )}
      </div>
    );
  }

  // ── Full card (selection state) ────────────────────────────────────────────
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 12, marginTop: 8 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
            💡 Onboarding Incentive
            {recommendation && (
              <span style={{ marginLeft: 6, fontSize: 9, background: '#fde68a', color: '#78350f', padding: '1px 6px', borderRadius: 3 }}>
                AI RECOMMENDATION
              </span>
            )}
          </div>
          {recommendation && (
            <div style={{ fontSize: 10, color: '#78350f', marginTop: 2 }}>{recommendation.reason}</div>
          )}
        </div>

      </div>

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[
          { key: 'split',    icon: '📅', label: 'Split Payments',  sub: 'Spread cost over monthly installments' },
          { key: 'discount', icon: '🏷',  label: 'Apply Discount',  sub: 'Reduce the one-time fee' },
        ].map(opt => (
          <button key={opt.key}
            onClick={() => {
              setMode(opt.key);
              // Auto-apply recommendation defaults
              if (opt.key === 'split' && recommendation?.type === 'split') setSplitMonths(recommendation.months);
              if (opt.key === 'discount' && recommendation?.type === 'discount') setDiscountPct(recommendation.pct);
            }}
            style={{
              flex: 1, padding: '8px 10px', border: `2px solid ${mode === opt.key ? '#0f1e3c' : '#e5e7eb'}`,
              borderRadius: 6, background: mode === opt.key ? '#0f1e3c' : 'white',
              color: mode === opt.key ? 'white' : '#374151',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s'
            }}>
            <div style={{ fontSize: 13, marginBottom: 2 }}>{opt.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{opt.label}</div>
            <div style={{ fontSize: 9, opacity: 0.75 }}>{opt.sub}</div>
            {recommendation?.type === opt.key && (
              <div style={{ fontSize: 8, marginTop: 3, fontWeight: 700, color: mode === opt.key ? '#fde68a' : '#d97706' }}>
                ★ Recommended
              </div>
            )}
          </button>
        ))}
        <button
          onClick={() => { setMode('none'); setAccepted(true); onChange?.({ mode: null, effectiveFee: fee, monthlyAdd: 0 }); }}
          style={{
            padding: '8px 10px', border: `2px solid ${mode === 'none' ? '#374151' : '#e5e7eb'}`, borderRadius: 6,
            background: mode === 'none' ? '#f3f4f6' : 'white',
            color: '#6b7280', cursor: 'pointer', textAlign: 'left', fontSize: 10
          }}>
          <div style={{ fontSize: 13, marginBottom: 2 }}>✕</div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>No Incentive</div>
          <div style={{ fontSize: 9, opacity: 0.75 }}>Full fee applies</div>
        </button>
      </div>

      {/* Split payment config */}
      {mode === 'split' && splitTier && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Split Payment Plan — {fmt$(fee)} over how many months?
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {Array.from({ length: splitTier.maxMonths }, (_, i) => i + 1).filter(m => [1,2,3,4,5,6,9,12].includes(m) && m <= splitTier.maxMonths).map(m => (
              <button key={m} onClick={() => setSplitMonths(m)}
                style={{
                  padding: '5px 12px', border: `2px solid ${splitMonths === m ? '#0f1e3c' : '#e5e7eb'}`,
                  borderRadius: 5, background: splitMonths === m ? '#0f1e3c' : 'white',
                  color: splitMonths === m ? 'white' : '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}>
                {m}mo
              </button>
            ))}
          </div>
          <div style={{ background: '#f0f4ff', borderRadius: 5, padding: '7px 10px' }}>
            <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700 }}>
              {fmt$(fee / splitMonths)}/month × {splitMonths} months = {fmt$(fee)} total
            </div>
            <div style={{ fontSize: 9, color: '#3b82f6', marginTop: 2 }}>
              Added to MRR for first {splitMonths} months · Full fee recovered if client defaults
            </div>
          </div>
        </div>
      )}

      {mode === 'split' && !splitTier && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: 8, marginBottom: 10, fontSize: 10, color: '#dc2626' }}>
          Onboarding fee of {fmt$(fee)} is below the $500 minimum for split payments.
        </div>
      )}

      {/* Discount config */}
      {mode === 'discount' && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Discount — select amount
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {DISCOUNT_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setDiscountPct(opt.value)}
                style={{
                  padding: '5px 12px', border: `2px solid ${discountPct === opt.value ? '#0f1e3c' : '#e5e7eb'}`,
                  borderRadius: 5, background: discountPct === opt.value ? '#0f1e3c' : 'white',
                  color: discountPct === opt.value ? 'white' : '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ background: discountPct === 100 ? '#f0fdf4' : '#f0f4ff', borderRadius: 5, padding: '7px 10px' }}>
            {discountPct === 100 ? (
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>
                Full Waive — {fmt$(fee)} onboarding fee waived
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700 }}>
                {fmt$(fee)} → {fmt$(fee * (1 - discountPct / 100))} effective fee
                <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 8, color: '#6b7280' }}>({fmt$(fee * discountPct / 100)} savings)</span>
              </div>
            )}
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>
              Full {fmt$(fee)} fee recoverable if client defaults per MSA
            </div>
          </div>
        </div>
      )}

      {/* Accept button */}
      {mode && mode !== null && (mode !== 'split' || splitTier) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => { setAccepted(true); }}
            style={{ padding: '6px 18px', background: '#166534', color: 'white', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Accept Incentive
          </button>
          <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', flex: 1 }}>
            ⚖ Default recovery clause applies — all incentives forfeited on breach
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export helper — formats incentive for SPT and quote save ─────────────────
export function formatIncentiveForExport(incentive, fee) {
  if (!incentive || !incentive.mode) return null;

  if (incentive.mode === 'split') {
    return {
      type: 'split',
      label: `Onboarding Split Payment Plan`,
      description: `${fmt$(fee)} onboarding fee spread over ${incentive.splitMonths} months at ${fmt$(incentive.monthlyAdd)}/mo`,
      monthlyAdder: incentive.monthlyAdd,
      fullFee: fee,
      effectiveFee: fee,
      splitMonths: incentive.splitMonths,
      legalNote: LEGAL_NOTE,
    };
  }

  if (incentive.mode === 'discount') {
    const label = incentive.discountPct === 100 ? 'Onboarding Fee — Full Waive' : `Onboarding Fee — ${incentive.discountPct}% Discount`;
    return {
      type: 'discount',
      label,
      description: incentive.discountPct === 100
        ? `One-time onboarding fee of ${fmt$(fee)} waived as part of this agreement`
        : `One-time onboarding fee reduced from ${fmt$(fee)} to ${fmt$(incentive.effectiveFee)} (${incentive.discountPct}% discount)`,
      discountPct: incentive.discountPct,
      discountAmount: incentive.discountAmount,
      fullFee: fee,
      effectiveFee: incentive.effectiveFee,
      legalNote: LEGAL_NOTE,
    };
  }

  return null;
}

export { LEGAL_NOTE };

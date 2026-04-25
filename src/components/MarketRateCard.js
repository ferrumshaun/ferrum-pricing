import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  BASE_RATES, RATE_LABELS, RATE_UNITS,
  getRating, isStale, getOrAnalyzeMarket,
  calcAfterHoursRates, saveRateSheet, getRateSheet,
  tierLabel, tierColor
} from '../lib/marketRates';

const fmt$ = n => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';
const fmtPct = n => n != null ? `${n > 0 ? '+' : ''}${Math.round(n * 100)}%` : '';

export default function MarketRateCard({ quoteId, clientZip, onRatesAccepted }) {
  const { profile } = useAuth();

  const [analysis,    setAnalysis]    = useState(null);
  const [rateSheet,   setRateSheet]   = useState(null);
  const [workingRates,setWorkingRates]= useState(null);
  const [overrides,   setOverrides]   = useState({});
  const [accepted,    setAccepted]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState('');
  const [showDetail,  setShowDetail]  = useState(false);
  const [isNewMarket, setIsNewMarket] = useState(false);
  const [statusMsg,   setStatusMsg]   = useState('');

  // Load market analysis when city/state available
  const loadAnalysis = useCallback(async (force = false) => {
    if (!clientZip || clientZip.length < 5) return;
    setLoading(true); setError(''); setStatusMsg('');
    try {
      const { analysis: result, wasRefreshed } = await getOrAnalyzeMarket(clientZip, force);
      setAnalysis(result);
      // Only reset working rates if no accepted rate sheet exists
      if (!rateSheet) {
        setWorkingRates({ ...result.rates });
        setOverrides({});
        setAccepted(false);
      }
      if (wasRefreshed && result.analysis_source === 'ai_generated') {
        setIsNewMarket(true);
        setStatusMsg('🆕 New market — AI analysis complete for ' + result.city + ', ' + result.state);
        setTimeout(() => setStatusMsg(''), 6000);
      } else if (wasRefreshed) {
        setStatusMsg('↻ Analysis refreshed');
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch (err) {
      setError('Market analysis unavailable: ' + err.message);
    }
    setLoading(false);
  }, [clientZip, rateSheet]);

  // Load existing rate sheet if quote is saved
  useEffect(() => {
    if (!quoteId) return;
    getRateSheet(quoteId).then(sheet => {
      if (sheet) {
        setRateSheet(sheet);
        setWorkingRates(sheet.accepted_rates);
        setOverrides(sheet.overrides || {});
        setAccepted(true);
        onRatesAccepted?.(sheet.accepted_rates, null);
      }
    });
  }, [quoteId]);

  // Trigger analysis when zip is ready
  useEffect(() => {
    if (clientZip && clientZip.length >= 5 && !rateSheet) {
      loadAnalysis(false);
    }
  }, [clientZip]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { analysis: result } = await getOrAnalyzeMarket(clientZip, true);
      setAnalysis(result);
      setWorkingRates({ ...result.rates });
      setOverrides({});
      setAccepted(false);
      setRateSheet(null);
    } catch (err) {
      setError('Refresh failed: ' + err.message);
    }
    setRefreshing(false);
  }

  async function handleAcceptAll() {
    if (!analysis || !workingRates) return;
    try {
      if (quoteId) {
        const sheet = await saveRateSheet(
          quoteId, analysis.id, analysis.city, analysis.state,
          clientZip, workingRates, overrides, profile?.id
        );
        setRateSheet(sheet);
      }
      setAccepted(true);
      onRatesAccepted?.(workingRates, analysis.market_tier);
    } catch (err) {
      setError('Failed to save rates: ' + err.message);
    }
  }

  function handleOverride(key, value) {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const newRates = { ...workingRates, [key]: num };
    const newOverrides = { ...overrides, [key]: num };
    setWorkingRates(newRates);
    setOverrides(newOverrides);
    setAccepted(false);
  }

  function handleResetOverride(key) {
    const newRates = { ...workingRates, [key]: analysis.rates[key] };
    const newOverrides = { ...overrides };
    delete newOverrides[key];
    setWorkingRates(newRates);
    setOverrides(newOverrides);
    setAccepted(false);
  }

  // ── Nothing to show yet ──────────────────────────────────────────────────
  if (!clientZip || clientZip.length < 5) return null;

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div>
            <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
              Analyzing market rates for {clientZip}...
            </span>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
              Checking database — if this is a new market, we'll run an AI analysis. Stand by...
            </div>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>⚠ {error}</div>
        <button onClick={() => loadAnalysis(true)} style={{ fontSize: 10, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
          Retry →
        </button>
      </div>
    );
  }

  if (!analysis || !workingRates) return null;

  const ahRates = calcAfterHoursRates(workingRates.onsite_additional);
  const stale = isStale(analysis.analyzed_at);
  const hasOverrides = Object.keys(overrides).length > 0;
  const overrideCount = Object.keys(overrides).length;

  return (
    <div style={{ border: `1px solid ${accepted ? '#bbf7d0' : stale ? '#fde68a' : '#e2e8f0'}`, borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: accepted ? '#f0fdf4' : stale ? '#fffbeb' : '#f8fafc',
        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${accepted ? '#bbf7d0' : stale ? '#fde68a' : '#e2e8f0'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>📊</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f1e3c' }}>
              Market Rate Analysis
              {accepted && <span style={{ marginLeft: 6, fontSize: 9, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>✓ ACCEPTED</span>}
              {hasOverrides && !accepted && <span style={{ marginLeft: 6, fontSize: 9, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{overrideCount} OVERRIDE{overrideCount > 1 ? 'S' : ''}</span>}
            </div>
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>
              {analysis.city}, {analysis.state}
              <span style={{ margin: '0 4px', color: '#d1d5db' }}>·</span>
              <span style={{ color: tierColor(analysis.market_tier), fontWeight: 600 }}>{tierLabel(analysis.market_tier)}</span>
              <span style={{ margin: '0 4px', color: '#d1d5db' }}>·</span>
              CoL Index: {analysis.col_index}
              <span style={{ margin: '0 4px', color: '#d1d5db' }}>·</span>
              <span style={{ color: stale ? '#d97706' : '#6b7280' }}>
                Analyzed: {new Date(analysis.analyzed_at).toLocaleDateString()}
                {stale && ' ⚠ stale'}
              </span>
              <span style={{ margin: '0 4px', color: '#d1d5db' }}>·</span>
              <span style={{ color: '#9ca3af', fontSize: 8, textTransform: 'uppercase' }}>{analysis.analysis_source}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ fontSize: 9, padding: '3px 8px', background: 'white', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', color: '#374151', fontWeight: 600, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? '...' : '↻ Refresh'}
          </button>
          <button onClick={() => setShowDetail(!showDetail)}
            style={{ fontSize: 9, padding: '3px 8px', background: 'white', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', color: '#374151', fontWeight: 600 }}>
            {showDetail ? '▲ Hide' : '▼ Details'}
          </button>
        </div>
      </div>

      {/* ── New market / status banner ──────────────────────────────────── */}
      {statusMsg && (
        <div style={{ padding: '7px 14px', background: isNewMarket ? '#eff6ff' : '#f0fdf4', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: isNewMarket ? '#1e40af' : '#166534' }}>{statusMsg}</span>
          <span style={{ fontSize: 10, color: '#6b7280' }}>· This market has been saved and will load instantly next time</span>
        </div>
      )}

      {/* ── Compact summary strip (always visible) ─────────────────────── */}
      <div style={{ padding: '8px 14px', background: 'white', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {Object.entries(workingRates).map(([key, val]) => {
          const rating = getRating(BASE_RATES[key], val);
          const isOverridden = key in overrides;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: '#6b7280' }}>{RATE_LABELS[key]?.split('/')[0]?.split('(')[0].trim().split(' ').slice(-1)[0]}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: isOverridden ? '#d97706' : '#0f1e3c', fontFamily: 'DM Mono, monospace' }}>
                {fmt$(val)}{RATE_UNITS[key]}
              </span>
              {rating && (
                <span style={{ fontSize: 8, fontWeight: 700, color: rating.color, padding: '0 3px', borderRadius: 2, background: rating.bg }}>
                  {rating.label}
                </span>
              )}
            </div>
          );
        })}
        {!accepted && (
          <button onClick={handleAcceptAll}
            style={{ marginLeft: 'auto', padding: '5px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Accept All Rates
          </button>
        )}
        {accepted && (
          <button onClick={() => setAccepted(false)}
            style={{ marginLeft: 'auto', padding: '4px 10px', background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>
            Modify
          </button>
        )}
      </div>

      {/* ── Detail panel ────────────────────────────────────────────────── */}
      {showDetail && (
        <div style={{ borderTop: '1px solid #f1f5f9', background: 'white', padding: '12px 14px' }}>

          {/* Rate table */}
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>
            Rate Comparison — Market vs FerrumIT Published vs Adjusted
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Service', 'Market Rate', 'FerrumIT Published', 'Adjusted Rate', 'vs Market', ''].map(h => (
                  <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(RATE_LABELS).map(([key, label]) => {
                const marketRate  = analysis.rates[key];
                const ferrumBase  = BASE_RATES[key];
                const adjusted    = workingRates[key];
                const rating      = getRating(ferrumBase, marketRate);
                const isOverridden = key in overrides;
                return (
                  <tr key={key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', fontSize: 10, color: '#374151', fontWeight: 500 }}>{label}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#0f1e3c', fontWeight: 600 }}>
                      {fmt$(marketRate)}{RATE_UNITS[key]}
                    </td>
                    <td style={{ padding: '6px 8px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#6b7280' }}>
                      {fmt$(ferrumBase)}{RATE_UNITS[key]}
                      {rating && (
                        <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700, color: rating.color }}>
                          {rating.label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 9, color: '#6b7280' }}>$</span>
                        <input
                          type="number"
                          value={adjusted}
                          onChange={e => handleOverride(key, e.target.value)}
                          disabled={accepted}
                          style={{
                            width: 64, padding: '2px 4px', border: `1px solid ${isOverridden ? '#fde68a' : '#e5e7eb'}`,
                            borderRadius: 3, fontSize: 10, fontFamily: 'DM Mono, monospace',
                            color: '#0f1e3c', fontWeight: 600,
                            background: accepted ? '#f9fafb' : isOverridden ? '#fffbeb' : 'white',
                            outline: 'none'
                          }}
                        />
                        {isOverridden && !accepted && (
                          <button onClick={() => handleResetOverride(key)}
                            style={{ fontSize: 9, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 9, fontFamily: 'DM Mono, monospace' }}>
                      {marketRate && adjusted ? (
                        <span style={{ color: adjusted > marketRate ? '#dc2626' : adjusted < marketRate ? '#2563eb' : '#166534', fontWeight: 600 }}>
                          {fmtPct((adjusted - marketRate) / marketRate)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '6px 8px' }} />
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* After-hours auto-calculated rates */}
          <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>
              After-Hours Rates (Auto-calculated: on-site rate × 1.5)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                ['Weekday 5pm–11pm', ahRates.weekday_evening_dispatch, ahRates.weekday_evening_rate],
                ['Weekend Day (7am–5pm)', ahRates.weekend_day_dispatch, ahRates.weekend_day_rate],
                ['Graveyard / Sunday', ahRates.graveyard_dispatch, ahRates.graveyard_rate],
              ].map(([label, dispatch, addl]) => (
                <div key={label} style={{ background: 'white', borderRadius: 4, padding: '7px 8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#0f1e3c' }}>
                    {fmt$(dispatch)} dispatch
                  </div>
                  <div style={{ fontSize: 9, color: '#374151' }}>
                    + {fmt$(addl)}/hr additional
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 6 }}>
              Static fees: Same-day +$200 · Next-day +$100 · Cancellation $125 · Abort $195
            </div>
          </div>

          {/* Pricing multiplier recommendation */}
          <div style={{ background: '#eff6ff', borderRadius: 6, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 20 }}>📐</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>
                Managed IT Pricing: {analysis.pricing_multiplier === 1.0 ? 'No adjustment — national standard rate' : analysis.pricing_multiplier > 1 ? `+${Math.round((analysis.pricing_multiplier - 1) * 100)}% above standard` : `${Math.round((1 - analysis.pricing_multiplier) * 100)}% below standard`}
              </div>
              <div style={{ fontSize: 9, color: '#3b82f6', marginTop: 2 }}>
                Recommended tier: <strong>{tierLabel(analysis.market_tier)}</strong> · Multiplier: {analysis.pricing_multiplier}x
                <span style={{ marginLeft: 6, color: '#6b7280' }}>— Apply via the Market Tier selector above</span>
              </div>
            </div>
          </div>

          {/* Market notes */}
          {analysis.market_notes && (
            <div style={{ background: '#f8fafc', borderRadius: 6, padding: '9px 12px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>Market Intelligence</div>
              <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.6 }}>{analysis.market_notes}</div>
            </div>
          )}

          {/* Accept/override actions */}
          {!accepted && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              {hasOverrides && (
                <button onClick={() => { setWorkingRates({ ...analysis.rates }); setOverrides({}); }}
                  style={{ padding: '6px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
                  Reset to Recommended
                </button>
              )}
              <button onClick={handleAcceptAll}
                style={{ padding: '6px 18px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {hasOverrides ? `Accept with ${overrideCount} Override${overrideCount > 1 ? 's' : ''}` : 'Accept All Rates'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

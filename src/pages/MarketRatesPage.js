import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getOrAnalyzeMarket, isStale, getRating, tierColor, tierLabel, BASE_RATES, RATE_LABELS, RATE_UNITS } from '../lib/marketRates';
import { fmt$ } from '../lib/pricing';

export default function MarketRatesPage() {
  const { isAdmin } = useAuth();
  return (
    <div style={{ height:'100%', overflowY:'auto', padding:'20px 24px', background:'#f8fafc' }}>
      <MarketRatesContent isAdmin={isAdmin} />
    </div>
  );
}

// ─── Market Rates Admin ───────────────────────────────────────────────────────
function MarketRatesContent({ isAdmin }) {
  // Clean zip to 5 digits for display and search
  const zip5 = z => { const d = z ? String(z).replace(/\D/g, '').slice(0, 5) : ''; return d; };
  const [markets,      setMarkets]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterTier,   setFilterTier]   = useState('all');
  const [expanded,     setExpanded]     = useState(null);
  const [analyzing,    setAnalyzing]    = useState(null);
  const [newMarket,    setNewMarket]    = useState({ zip: '', city: '', state: '' });
  const [showNew,      setShowNew]      = useState(false);
  const [newLoading,   setNewLoading]   = useState(false);
  const [newMsg,       setNewMsg]       = useState('');
  const [editRates,    setEditRates]    = useState(null);
  const [saving,       setSaving]       = useState(false);


  useEffect(() => { loadMarkets(); }, []);

  async function loadMarkets() {
    setLoading(true);
    const { data } = await supabase
      .from('market_rate_analyses')
      .select('*')
      .order('state', { ascending: true })
      .order('city', { ascending: true });
    setMarkets(data || []);
    setLoading(false);
  }

  async function refreshMarket(market) {
    setAnalyzing(market.id);
    try {
      const cleanZip = zip5(market.zip) || null;
      await getOrAnalyzeMarket(cleanZip, true, market.city, market.state);
      await loadMarkets();
    } catch (e) {
      alert('Refresh failed: ' + e.message);
    }
    setAnalyzing(null);
  }

  async function deleteMarket(market) {
    if (!window.confirm(`Delete ${market.city}, ${market.state}? This will remove all stored rate data. The market will be re-analyzed fresh next time a quote uses this location.`)) return;
    const { error } = await supabase.from('market_rate_analyses').delete().eq('id', market.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await loadMarkets();
  }

  async function analyzeNew() {
    if (!newMarket.zip && (!newMarket.city || !newMarket.state)) {
      setNewMsg('Enter a zip code, or city + state.');
      return;
    }
    setNewLoading(true); setNewMsg('');
    try {
      await getOrAnalyzeMarket(newMarket.zip || null, true, newMarket.city || null, newMarket.state || null);
      setNewMsg('✓ Analysis complete');
      setNewMarket({ zip: '', city: '', state: '' });
      await loadMarkets();
      setTimeout(() => { setShowNew(false); setNewMsg(''); }, 1500);
    } catch (e) {
      setNewMsg('✗ ' + e.message);
    }
    setNewLoading(false);
  }

  async function saveRateOverrides(market) {
    if (!editRates) return;
    setSaving(true);
    try {
      await supabase.from('market_rate_analyses')
        .update({ rates: editRates, updated_at: new Date().toISOString() })
        .eq('id', market.id);
      await loadMarkets();
      setExpanded(null);
      setEditRates(null);
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  const filtered = markets.filter(m => {
    const q = search.toLowerCase();
    const zipQ = q.replace(/\D/g, '');
    const allZips = m.zip_codes?.length > 0 ? m.zip_codes : (zip5(m.zip) ? [zip5(m.zip)] : []);
    const matchSearch = !q
      || (m.city?.toLowerCase() ?? '').includes(q)
      || (m.state?.toLowerCase() ?? '').includes(q)
      || (zipQ.length >= 2 && allZips.some(z => z.includes(zipQ)));
    const matchTier = filterTier === 'all' || m.market_tier === filterTier;
    return matchSearch && matchTier;
  });

  const staleCount = markets.filter(m => isStale(m.analyzed_at)).length;

  return (
    <div>
      {/* Analyzing status banner */}
      {analyzing && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, marginBottom:12 }}>
          <span style={{ display:'inline-block', width:14, height:14, border:'2px solid #93c5fd', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.7s linear infinite', flexShrink:0 }}/>
          <span style={{ fontSize:12, color:'#1e40af', fontWeight:600 }}>
            Running AI market analysis — this may take 15–30 seconds...
          </span>
        </div>
      )}

      {/* Spin keyframe injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c', margin: 0 }}>Market Intelligence</h2>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {markets.length} markets · {staleCount > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{staleCount} stale (6+ months)</span>}
            {staleCount === 0 && markets.length > 0 && <span style={{ color: '#166534' }}>All analyses current</span>}
          </div>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          style={{ padding: '7px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + Analyze New Market
        </button>
      </div>

      {/* New market panel */}
      {showNew && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1e3c', marginBottom: 10 }}>Analyze New Market</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>ZIP Code</label>
              <input value={newMarket.zip} onChange={e => setNewMarket(m => ({ ...m, zip: e.target.value }))}
                placeholder="e.g. 90210"
                style={{ width: 100, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', paddingBottom: 8 }}>or</div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>City</label>
              <input value={newMarket.city} onChange={e => setNewMarket(m => ({ ...m, city: e.target.value }))}
                placeholder="e.g. Austin"
                style={{ width: 140, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>State</label>
              <input value={newMarket.state} onChange={e => setNewMarket(m => ({ ...m, state: e.target.value.toUpperCase().slice(0,2) }))}
                placeholder="TX"
                style={{ width: 48, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none', textTransform: 'uppercase' }} />
            </div>
            <button onClick={analyzeNew} disabled={newLoading}
              style={{ padding: '7px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: newLoading ? 0.6 : 1 }}>
              {newLoading ? 'Analyzing...' : 'Run Analysis'}
            </button>
            <button onClick={() => { setShowNew(false); setNewMsg(''); }}
              style={{ padding: '7px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
          {newMsg && (
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: newMsg.startsWith('✓') ? '#166534' : '#dc2626' }}>{newMsg}</div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search city, state, or zip..."
          style={{ flex: 1, maxWidth: 280, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none' }} />
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, background: 'white', outline: 'none' }}>
          <option value="all">All Tiers</option>
          <option value="secondary">Secondary</option>
          <option value="adjusted">Adjusted</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
        <div style={{ fontSize: 11, color: '#9ca3af', alignSelf: 'center' }}>{filtered.length} markets</div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 12 }}>Loading markets...</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Market', 'Tier', 'CoL Index', 'Remote', 'On-Site Block', 'Dev/CRM', 'Last Analyzed', 'Source', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const stale = isStale(m.analyzed_at);
                const isExpanded = expanded === m.id;
                const rates = m.rates || {};
                return (
                  <>
                    <tr key={m.id}
                      style={{ borderBottom: '1px solid #f1f5f9', background: isExpanded ? '#f8fafc' : 'white', cursor: 'pointer' }}
                      onClick={() => { setExpanded(isExpanded ? null : m.id); setEditRates(isExpanded ? null : { ...rates }); }}>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1e3c' }}>{m.city}, {m.state}</div>
                        {/* All known zip codes as tags */}
                        {(m.zip_codes?.length > 0 || m.zip) && (
                          <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginTop:2 }}>
                            {(m.zip_codes?.length > 0 ? m.zip_codes : [zip5(m.zip)]).filter(Boolean).map(z => (
                              <span key={z} style={{ fontSize:9, fontFamily:'DM Mono, monospace', background:'#f1f5f9', color:'#475569', padding:'1px 4px', borderRadius:3, border:'1px solid #e2e8f0' }}>{z}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tierColor(m.market_tier), background: tierColor(m.market_tier) + '18', padding: '2px 7px', borderRadius: 3 }}>
                          {tierLabel(m.market_tier)}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{m.col_index}</td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$(rates.remote_support)}/hr</td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$(rates.onsite_block_2hr)}</td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$(rates.dev_crm)}/hr</td>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ fontSize: 10, color: stale ? '#d97706' : '#6b7280', fontWeight: stale ? 600 : 400 }}>
                          {new Date(m.analyzed_at).toLocaleDateString()}
                          {stale && ' ⚠'}
                        </div>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.analysis_source}</span>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAdmin && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteMarket(m); }}
                            style={{ fontSize: 10, padding: '3px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            🗑 Delete
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); refreshMarket(m); }}
                          disabled={analyzing === m.id}
                          style={{ fontSize: 10, padding: '3px 8px', background: analyzing === m.id ? '#eff6ff' : 'white', border: `1px solid ${analyzing === m.id ? '#93c5fd' : '#d1d5db'}`, borderRadius: 4, cursor: analyzing === m.id ? 'default' : 'pointer', color: analyzing === m.id ? '#2563eb' : '#374151', fontWeight: 600, whiteSpace: 'nowrap', display:'flex', alignItems:'center', gap:4 }}>
                          {analyzing === m.id ? (
                            <>
                              <span style={{ display:'inline-block', width:8, height:8, border:'2px solid #93c5fd', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                              Analyzing...
                            </>
                          ) : '↻ Refresh'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && editRates && (
                      <tr key={m.id + '_detail'}>
                        <td colSpan={9} style={{ padding: '0 0 12px 0', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                          <div style={{ padding: '12px 14px' }}>

                            {/* Rate edit grid */}
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.06em', marginBottom: 10 }}>
                              Rates — edit to override, then save
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                              {Object.entries(RATE_LABELS).map(([key, label]) => {
                                const marketRate = editRates[key];
                                const rating = getRating(BASE_RATES[key], marketRate);
                                return (
                                  <div key={key} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px' }}>
                                    <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>{label}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{ fontSize: 10, color: '#6b7280' }}>$</span>
                                      <input
                                        type="number"
                                        value={editRates[key] || ''}
                                        onChange={e => setEditRates(r => ({ ...r, [key]: parseFloat(e.target.value) || 0 }))}
                                        style={{ width: 70, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#0f1e3c', outline: 'none' }}
                                      />
                                      <span style={{ fontSize: 9, color: '#9ca3af' }}>{RATE_UNITS[key]}</span>
                                    </div>
                                    {rating && (
                                      <div style={{ fontSize: 8, fontWeight: 700, color: rating.color, marginTop: 3 }}>
                                        {rating.label} vs published
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* ZIP Codes */}
                            <div style={{ marginBottom:10 }}>
                              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#6b7280', marginBottom:4 }}>ZIP Codes Mapped to This Market</div>
                              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                                {(m.zip_codes?.length > 0 ? m.zip_codes : zip5(m.zip) ? [zip5(m.zip)] : []).map(z => (
                                  <span key={z} style={{ fontSize:11, fontFamily:'DM Mono, monospace', background:'#f1f5f9', color:'#374151', padding:'3px 8px', borderRadius:4, border:'1px solid #e2e8f0', fontWeight:600 }}>{z}</span>
                                ))}
                                {!m.zip_codes?.length && !m.zip && (
                                  <span style={{ fontSize:10, color:'#9ca3af', fontStyle:'italic' }}>No zips on file — analyzed by city/state only</span>
                                )}
                              </div>
                            </div>

                            {/* Pricing multiplier & market notes */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                              <div style={{ background: '#eff6ff', borderRadius: 6, padding: '8px 12px', flex: '0 0 auto' }}>
                                <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 2 }}>Pricing Multiplier</div>
                                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#1e40af' }}>{m.pricing_multiplier}x</div>
                                <div style={{ fontSize: 9, color: '#3b82f6' }}>Managed IT package adjustment</div>
                              </div>
                              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', flex: 1 }}>
                                <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Intelligence</div>
                                <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>{m.market_notes || '—'}</div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => saveRateOverrides(m)} disabled={saving}
                                style={{ padding: '6px 16px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                                {saving ? 'Saving...' : 'Save Rate Changes'}
                              </button>
                              <button onClick={() => refreshMarket(m)} disabled={analyzing === m.id}
                                style={{ padding: '6px 14px', background: analyzing === m.id ? '#eff6ff' : 'white', border: `1px solid ${analyzing === m.id ? '#93c5fd' : '#d1d5db'}`, borderRadius: 5, fontSize: 11, color: analyzing === m.id ? '#2563eb' : '#374151', cursor: analyzing === m.id ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:6 }}>
                                {analyzing === m.id ? (
                                  <>
                                    <span style={{ display:'inline-block', width:10, height:10, border:'2px solid #93c5fd', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                                    Re-analyzing market...
                                  </>
                                ) : '↻ Re-run AI Analysis'}
                              </button>
                              <button onClick={() => { setExpanded(null); setEditRates(null); }}
                                style={{ padding: '6px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
                                Close
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                  No markets found. Use "Analyze New Market" to add one.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

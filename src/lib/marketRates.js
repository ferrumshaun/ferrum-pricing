// Market Rate Engine — client-side library
// Handles lookups, AI analysis calls, and rate sheet persistence

import { supabase } from './supabase';

export const BASE_RATES = {
  remote_support:    165,
  onsite_block_2hr:  330,
  onsite_additional: 165,
  dev_crm:           220,
  design_ux:         140,
  pc_setup:          250,
};

export const RATE_LABELS = {
  remote_support:    'Remote Support / Help Desk',
  onsite_block_2hr:  'On-Site Dispatch (2hr Block)',
  onsite_additional: 'On-Site Additional Hourly',
  dev_crm:           'Dev / CRM / DB / Web',
  design_ux:         'Graphic Design & UX',
  pc_setup:          'PC Setup Fee',
};

export const RATE_UNITS = {
  remote_support:    '/hr',
  onsite_block_2hr:  ' block',
  onsite_additional: '/hr',
  dev_crm:           '/hr',
  design_ux:         '/hr',
  pc_setup:          '/ea',
};

const STALE_MONTHS = 6;

// ── Rate comparison rating ─────────────────────────────────────────────────
export function getRating(ferrumRate, marketRate) {
  if (!marketRate) return null;
  const diff = (ferrumRate - marketRate) / marketRate;
  if (diff > 0.25)       return { label: 'HIGH',          color: '#dc2626', bg: '#fef2f2', diff };
  if (diff > 0.10)       return { label: 'SLIGHTLY HIGH', color: '#d97706', bg: '#fffbeb', diff };
  if (diff < -0.05)      return { label: 'LOW',           color: '#2563eb', bg: '#eff6ff', diff };
  return                         { label: 'FAIR',          color: '#166534', bg: '#f0fdf4', diff };
}

// ── Check if analysis is stale ─────────────────────────────────────────────
export function isStale(analyzedAt) {
  if (!analyzedAt) return true;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - STALE_MONTHS);
  return new Date(analyzedAt) < cutoff;
}

// ── Look up market by city+state (from zip lookup result) ──────────────────
export async function getMarketAnalysis(city, state) {
  if (!city || !state) return null;
  const { data } = await supabase
    .from('market_rate_analyses')
    .select('*')
    .ilike('city', city)
    .ilike('state', state)
    .single();
  return data || null;
}

// ── Run AI analysis for a market ───────────────────────────────────────────
export async function runMarketAnalysis(city, state, zip) {
  const res = await fetch('/.netlify/functions/marketAnalysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze', payload: { city, state, zip, returnCityState: !city } })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Analysis failed');
  return data.analysis;
}

// ── Save analysis to DB (upsert) ──────────────────────────────────────────
export async function saveMarketAnalysis(city, state, zip, analysis, source = 'ai_generated') {
  const record = {
    city, state, zip: zip || null,
    col_index:          analysis.col_index,
    median_income:      analysis.median_income || null,
    unemployment_rate:  analysis.unemployment_rate || null,
    market_tier:        analysis.market_tier,
    pricing_multiplier: analysis.pricing_multiplier,
    rates:              analysis.rates,
    market_notes:       analysis.market_notes || null,
    analysis_source:    source,
    analyzed_at:        new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('market_rate_analyses')
    .upsert(record, { onConflict: 'city,state' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── Look up by zip first ──────────────────────────────────────────────────
export async function getMarketByZip(zip) {
  if (!zip || zip.length < 5) return null;
  const { data } = await supabase
    .from('market_rate_analyses')
    .select('*')
    .eq('zip', zip)
    .maybeSingle();
  return data || null;
}

// ── Get or analyze — main entry point ─────────────────────────────────────
// Accepts zip alone — resolves city/state via DB or AI
// Returns { analysis, wasRefreshed }
export async function getOrAnalyzeMarket(zip, forceRefresh = false, cityHint, stateHint) {
  // Require either a zip or city+state — otherwise nothing to look up
  if (!zip && !(cityHint && stateHint)) return null;

  // 1. Try exact zip match first (only when zip is available)
  if (!forceRefresh && zip) {
    const byZip = await getMarketByZip(zip);
    if (byZip && !isStale(byZip.analyzed_at)) {
      return { analysis: byZip, wasRefreshed: false };
    }
  }

  // 2. Try city+state match if we have hints
  if (!forceRefresh && cityHint && stateHint) {
    const byCityState = await getMarketAnalysis(cityHint, stateHint);
    if (byCityState && !isStale(byCityState.analyzed_at)) {
      // Tag with zip for future lookups if we now have one
      if (zip && !byCityState.zip) {
        await supabase.from('market_rate_analyses')
          .update({ zip, updated_at: new Date().toISOString() })
          .eq('id', byCityState.id);
      }
      return { analysis: byCityState, wasRefreshed: false };
    }
  }

  // 3. Run AI analysis — pass zip + any hints
  const aiResult = await runMarketAnalysis(cityHint || null, stateHint || null, zip || null);

  // AI returns city/state in the result
  const city  = aiResult.city  || cityHint  || 'Unknown';
  const state = aiResult.state || stateHint || 'XX';

  const saved = await saveMarketAnalysis(city, state, zip || null, aiResult, 'ai_generated');
  return { analysis: saved, wasRefreshed: true };
}

// ── Calculate after-hours rates from accepted on-site rate ─────────────────
export function calcAfterHoursRates(onsiteAdditional) {
  const base = onsiteAdditional || BASE_RATES.onsite_additional;
  const ahRate = Math.round(base * 1.5 / 5) * 5; // 1.5x, rounded to $5
  return {
    weekday_evening_rate:   ahRate,
    weekday_evening_dispatch: Math.round(300 * (base / 165) / 5) * 5,
    weekend_day_rate:       ahRate,
    weekend_day_dispatch:   Math.round(285 * (base / 165) / 5) * 5,
    graveyard_rate:         Math.round(ahRate * 1.15 / 5) * 5,
    graveyard_dispatch:     Math.round(380 * (base / 165) / 5) * 5,
  };
}

// ── Save accepted rate sheet to quote ─────────────────────────────────────
export async function saveRateSheet(quoteId, analysisId, marketCity, marketState, marketZip, acceptedRates, overrides, acceptedBy) {
  const { data, error } = await supabase
    .from('quote_rate_sheets')
    .upsert({
      quote_id:      quoteId,
      analysis_id:   analysisId,
      market_city:   marketCity,
      market_state:  marketState,
      market_zip:    marketZip,
      accepted_rates: acceptedRates,
      overrides:     overrides || {},
      accepted_by:   acceptedBy,
      accepted_at:   new Date().toISOString(),
    }, { onConflict: 'quote_id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── Load existing rate sheet for a quote ──────────────────────────────────
export async function getRateSheet(quoteId) {
  if (!quoteId) return null;
  const { data } = await supabase
    .from('quote_rate_sheets')
    .select('*')
    .eq('quote_id', quoteId)
    .single();
  return data || null;
}

// ── Tier display helpers ──────────────────────────────────────────────────
export function tierLabel(tier) {
  const map = { secondary: 'Secondary', adjusted: 'Adjusted', standard: 'Standard', premium: 'Premium' };
  return map[tier] || tier;
}

export function tierColor(tier) {
  const map = { secondary: '#6b7280', adjusted: '#d97706', standard: '#2563eb', premium: '#7c3aed' };
  return map[tier] || '#374151';
}

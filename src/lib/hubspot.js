// HubSpot CRM Integration — routes through Netlify proxy to avoid CORS
import { supabase } from './supabase';

// Portal ID — hardcoded for Ferrum's HubSpot instance. If this ever needs to
// move to a setting, update this constant and the dealUrlFor() callers.
const HUBSPOT_PORTAL_ID = '47514592';

// Build a deal record URL from just the deal id. HubSpot deal URLs follow
// a deterministic pattern, so when the proxy response or a saved row is
// missing dealUrl we can still produce a working "View →" link from the id.
export function dealUrlFor(dealId) {
  if (!dealId) return '';
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${dealId}`;
}

async function getToken() {
  const { data } = await supabase
    .from('pricing_settings')
    .select('value')
    .eq('key', 'hubspot_token')
    .single();
  return data?.value || null;
}

async function callProxy(action, payload = {}) {
  const token = await getToken();
  if (!token) throw new Error('HubSpot token not configured. Go to Admin → Integrations.');
  const res = await fetch('/.netlify/functions/hubspot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, payload })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `HubSpot error (${res.status})`);
  return data;
}

export async function testConnection()    { return callProxy('test'); }
export async function searchDeals(query)  {
  const data = await callProxy('search', { query });
  return data.results || [];
}
// Always returns a response with a populated `dealUrl` — falls back to a
// constructed URL when the proxy doesn't supply one. Without this guard,
// older deals (or proxy responses missing the field) caused front-end code
// to save dealUrl='' to the quote row, which then rendered the View link
// as `<a href="">` — clicking it reloads the current page instead of
// opening HubSpot. Symptom: "View Deal" navigates back to the quote.
export async function getDealFull(dealId) {
  const full = await callProxy('get_deal_full', { dealId });
  if (full && !full.dealUrl) full.dealUrl = dealUrlFor(full.dealId || dealId);
  return full;
}
export async function createDeal(p)       {
  const deal = await callProxy('create', p);
  return { id: deal.id, url: deal.dealUrl || dealUrlFor(deal.id) };
}
export async function updateDeal(dealId, p) { return callProxy('update', { dealId, ...p }); }

// Push deal description field to HubSpot
export async function updateDealDescription(dealId, description) {
  return callProxy('update_description', { dealId, description });
}

// Post an engagement note — shows in HubSpot deal activity timeline
export async function createHubspotNote(dealId, body) {
  return callProxy('create_note', { dealId, body });
}

export async function getDealProperties() {
  return callProxy('get_deal_properties');
}

// Write quote URL into a configured HubSpot deal field.
// fieldKey comes from pricing_settings.hubspot_quote_url_field (loaded by caller).
export async function writeQuoteUrlToDeal(dealId, quoteUrl, fieldKey) {
  if (!dealId || !quoteUrl || !fieldKey) return null;
  return callProxy('update_deal_property', {
    dealId,
    propertyName:  fieldKey,
    propertyValue: quoteUrl,
  });
}

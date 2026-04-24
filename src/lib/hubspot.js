// HubSpot CRM Integration — routes through Netlify proxy to avoid CORS
import { supabase } from './supabase';

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
export async function getDealFull(dealId) { return callProxy('get_deal_full', { dealId }); }
export async function createDeal(p)       {
  const deal = await callProxy('create', p);
  return { id: deal.id, url: deal.dealUrl || `https://app.hubspot.com/contacts/deals/${deal.id}` };
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

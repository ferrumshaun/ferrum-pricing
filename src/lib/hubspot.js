// HubSpot CRM Integration
// All calls go through /.netlify/functions/hubspot to avoid CORS issues
// Token is stored in Supabase pricing_settings

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
  if (!token) throw new Error('HubSpot token not configured. Go to Admin → Integrations to add it.');

  const res = await fetch('/.netlify/functions/hubspot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, payload })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `HubSpot error (${res.status})`);
  return data;
}

export async function testConnection() {
  return callProxy('test');
}

export async function searchDeals(query) {
  const data = await callProxy('search', { query });
  return data.results || [];
}

export async function createDeal({ clientName, mrr, contractValue, packageName, quoteNumber, contractTerm }) {
  const deal = await callProxy('create', { clientName, mrr, contractValue, packageName, quoteNumber, contractTerm });
  return {
    id:  deal.id,
    url: `https://app.hubspot.com/contacts/deals/${deal.id}`
  };
}

export async function updateDeal(dealId, { mrr, contractValue, packageName, quoteNumber, contractTerm }) {
  return callProxy('update', { dealId, mrr, contractValue, packageName, quoteNumber, contractTerm });
}

export async function getDeal(dealId) {
  return callProxy('get', { dealId });
}

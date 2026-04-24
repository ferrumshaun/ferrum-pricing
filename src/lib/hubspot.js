// HubSpot CRM Integration
// Token is stored in Supabase pricing_settings, never in code

import { supabase } from './supabase';

async function getToken() {
  const { data } = await supabase
    .from('pricing_settings')
    .select('value')
    .eq('key', 'hubspot_token')
    .single();
  return data?.value || null;
}

// Search for deals by name — returns array of matches
export async function searchDeals(query) {
  const token = await getToken();
  if (!token) throw new Error('HubSpot token not configured. Go to Admin → Integrations.');

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{
        filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: query }]
      }],
      properties: ['dealname', 'dealstage', 'amount', 'closedate', 'hubspot_owner_id'],
      limit: 10
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'HubSpot search failed');
  }
  const data = await res.json();
  return data.results || [];
}

// Create a new deal
export async function createDeal({ clientName, mrr, contractValue, packageName, quoteNumber, contractTerm }) {
  const token = await getToken();
  if (!token) throw new Error('HubSpot token not configured. Go to Admin → Integrations.');

  const closeDate = new Date();
  closeDate.setDate(closeDate.getDate() + 30); // default 30-day close

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: {
        dealname:        `${clientName} — ${packageName}`,
        amount:          contractValue.toFixed(2),
        closedate:       closeDate.toISOString().split('T')[0],
        dealstage:       'appointmentscheduled',
        pipeline:        'default',
        description:     `FerrumIT Quote ${quoteNumber} | Package: ${packageName} | MRR: $${mrr.toFixed(2)}/mo | Term: ${contractTerm} months`,
        ferrum_quote_number: quoteNumber || '',
        ferrum_mrr:      mrr.toFixed(2),
      }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create HubSpot deal');
  }
  const deal = await res.json();
  return {
    id:  deal.id,
    url: `https://app.hubspot.com/contacts/deals/${deal.id}`
  };
}

// Get a single deal by ID
export async function getDeal(dealId) {
  const token = await getToken();
  if (!token) throw new Error('HubSpot token not configured.');

  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,amount,closedate`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// Update an existing deal with latest quote data
export async function updateDeal(dealId, { mrr, contractValue, packageName, quoteNumber, contractTerm }) {
  const token = await getToken();
  if (!token) throw new Error('HubSpot token not configured.');

  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: {
        amount:      contractValue.toFixed(2),
        description: `FerrumIT Quote ${quoteNumber} | Package: ${packageName} | MRR: $${mrr.toFixed(2)}/mo | Term: ${contractTerm} months`,
        ferrum_mrr:  mrr.toFixed(2),
      }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to update HubSpot deal');
  }
  return res.json();
}

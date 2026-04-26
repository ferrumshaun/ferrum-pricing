// smartPricingTable.js — SPT API client
// All calls go through the Netlify proxy to keep the API key server-side

async function sptCall(action, payload, sptApiKey) {
  const res = await fetch('/.netlify/functions/sptProxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload, sptApiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `SPT API error ${res.status}`);
  return data;
}

// ── Rate sheet export ─────────────────────────────────────────────────────────
// Converts a Ferrum IQ rate sheet into SPT proposal pages format
export function buildRateSheetSPTPayload({ rateSheet, quote, proposalName }) {
  const { meta, sections } = rateSheet;

  // Build line items for SPT from each section
  const pages = sections.map(section => ({
    name: section.title,
    sections: [
      ...(section.note ? [{
        type: 'text',
        content: section.note,
      }] : []),
      {
        type: 'table',
        columns: ['Service', 'Rate'],
        rows: section.items.map(item => [
          item.service,
          item.label || (item.rate !== null
            ? `$${item.rate.toFixed(2)}${item.unit}${item.minimum ? ` (${item.minimum})` : ''}`
            : '—'),
        ]),
      },
    ],
  }));

  return {
    name: proposalName || `${meta.clientName || 'Client'} — Out-of-Scope Rate Schedule`,
    settings: {
      recipient: {
        name: meta.clientName || '',
        contact: {
          name:  meta.recipientContact || '',
          email: '',
        },
      },
    },
    // SPT uses a specific page/item structure — we pass the raw data
    // and SPT will render it according to their template
    custom_variables: [
      { id: 'market_city',  label: 'Market City',       value: meta.city  || '', type: 'single-line' },
      { id: 'market_state', label: 'Market State',      value: meta.state || '', type: 'single-line' },
      { id: 'market_tier',  label: 'Market Tier',       value: meta.tier  || '', type: 'single-line' },
      { id: 'area2',        label: 'Area 2 Market',     value: meta.area2 ? 'Yes' : 'No', type: 'single-line' },
      { id: 'generated_at', label: 'Rate Sheet Date',   value: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), type: 'single-line' },
    ],
    tags: ['rate-sheet', 'ferrum-iq'],
  };
}

// ── Main exports ──────────────────────────────────────────────────────────────

export async function createSPTProposal({ rateSheet, quote, proposalName, sptApiKey }) {
  const payload = buildRateSheetSPTPayload({ rateSheet, quote, proposalName });
  return sptCall('createProposal', payload, sptApiKey);
}

export async function getSPTProposal({ proposalId, sptApiKey }) {
  return sptCall('getProposal', { proposalId }, sptApiKey);
}

export async function listSPTProposals({ search, sptApiKey }) {
  return sptCall('listProposals', { search, limit: 20 }, sptApiKey);
}

export async function linkExistingSPTProposal({ proposalId, sptApiKey }) {
  return sptCall('getProposal', { proposalId }, sptApiKey);
}

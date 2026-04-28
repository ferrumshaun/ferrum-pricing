// smartPricingTable.js — SPT API client + payload builders
// All calls go through the Netlify proxy to keep the API key server-side

import { buildFlexITSPTPayload } from './sptFlexIT';

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

// ── Rate sheet export (generic — used by IT/Voice/Bundle/MultiSite) ───────────
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
      { id: 'generated_at', label: 'Rate Sheet Date',   value: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), type: 'single-line' },
    ],
    tags: ['rate-sheet', 'ferrum-iq'],
  };
}

// ── Generic exports (used by IT/Voice/Bundle/MultiSite) ──────────────────────

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

// ── FlexIT On-Demand exports ─────────────────────────────────────────────────
// Mirrors the FlexIT — On-Demand IT Support template (RKshoc6dAEeA) — full
// proposal with cover, billing, assumptions, market-adjusted rate card,
// payment schedule, and acceptance terms.

export { buildFlexITSPTPayload } from './sptFlexIT';

/**
 * Create a structured FlexIT On-Demand proposal in Smart Pricing Table.
 *
 * @param {Object}   args
 * @param {Object}   args.quote     - FlexIT quote shape (see buildFlexITQuoteShape below)
 * @param {Object}   args.rateSheet - Output of buildRateSheet({ analysis, settings, ... })
 * @param {Object}   args.settings  - pricing_settings record
 * @param {string}   args.sptApiKey - SPT API key
 * @returns {Promise<{ id: string, url?: string, name: string, ... }>}
 */
export async function createFlexITSPTProposal({ quote, rateSheet, settings, sptApiKey }) {
  const payload = buildFlexITSPTPayload({ quote, rateSheet, settings });
  return sptCall('createProposal', payload, sptApiKey);
}

/**
 * Adapter — converts FlexITQuotePage state into the `quote` shape that
 * buildFlexITSPTPayload expects. Use this in FlexITQuotePage so the SPT
 * payload tracks whatever the rep has currently entered.
 *
 * @param {Object} state - FlexIT quote page state (or saved-quote row)
 * @returns {Object} normalized quote shape
 */
export function buildFlexITQuoteShape(state) {
  const {
    proposalName,
    recipientBiz,
    recipientContact,
    recipientEmail,
    recipientAddress,
    marketCity,
    marketState,
    prepayHours = 2,
    prepayAmount,
    remoteRate,
    flexHours,
    flexBlock,        // optional pre-computed { blockPrice, ratePerHour } from calcFlexBlock
    quoteNumber,
  } = state || {};

  return {
    proposalName,
    clientName:    recipientBiz,
    clientContact: recipientContact,
    clientEmail:   recipientEmail,
    clientAddress: recipientAddress,
    marketCity,
    marketState,
    prepayHours,
    prepayAmount,
    remoteRate,
    flexHours:            flexHours || 0,
    flexBlockPrice:       flexBlock?.blockPrice  || 0,
    flexBlockRatePerHour: flexBlock?.ratePerHour || 0,
    quoteNumber,
  };
}

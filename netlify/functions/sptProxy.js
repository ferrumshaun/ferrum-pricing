// Netlify function — Smart Pricing Table API proxy
// Keeps the SPT API key server-side, never exposed to the browser

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, payload, sptApiKey } = body;

  // Use env var first, fall back to key passed from settings
  const apiKey = process.env.SPT_API_KEY || sptApiKey;
  if (!apiKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'SPT API key not configured. Add it in Admin → Integrations → Smart Pricing Table.' }) };
  }

  const BASE = 'https://web.smartpricingtable.com/api';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  try {
    switch (action) {

      // ── List proposals ──────────────────────────────────────────────────────
      case 'listProposals': {
        const { search, status, page = 1, limit = 20 } = payload || {};
        const params = new URLSearchParams({ page, limit });
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        const res = await fetch(`${BASE}/proposals?${params}`, { headers });
        const data = await res.json();
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── Create proposal ─────────────────────────────────────────────────────
      case 'createProposal': {
        const res = await fetch(`${BASE}/proposals`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── Get proposal ────────────────────────────────────────────────────────
      case 'getProposal': {
        const res = await fetch(`${BASE}/proposals/${payload.proposalId}`, { headers });
        const data = await res.json();
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── Update proposal ─────────────────────────────────────────────────────
      case 'updateProposal': {
        const res = await fetch(`${BASE}/proposals/${payload.proposalId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload.updates),
        });
        const data = await res.json();
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

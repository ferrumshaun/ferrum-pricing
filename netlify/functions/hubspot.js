// Netlify serverless function — proxies HubSpot API calls server-side
// This avoids CORS issues that occur when calling HubSpot directly from the browser

const HUBSPOT_BASE = 'https://api.hubapi.com';

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { action, token, payload } = body;

  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No token provided' }) };
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    let url, method, reqBody;

    switch (action) {
      case 'test':
        url    = `${HUBSPOT_BASE}/crm/v3/objects/deals?limit=1`;
        method = 'GET';
        break;

      case 'search':
        url    = `${HUBSPOT_BASE}/crm/v3/objects/deals/search`;
        method = 'POST';
        reqBody = JSON.stringify({
          filterGroups: [{
            filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: payload.query }]
          }],
          properties: ['dealname', 'dealstage', 'amount', 'closedate'],
          limit: 10
        });
        break;

      case 'create':
        url    = `${HUBSPOT_BASE}/crm/v3/objects/deals`;
        method = 'POST';
        const closeDate = new Date();
        closeDate.setDate(closeDate.getDate() + 30);
        reqBody = JSON.stringify({
          properties: {
            dealname:    `${payload.clientName} — ${payload.packageName}`,
            amount:      payload.contractValue?.toFixed(2),
            closedate:   closeDate.toISOString().split('T')[0],
            dealstage:   'appointmentscheduled',
            pipeline:    'default',
            description: `FerrumIT Quote ${payload.quoteNumber} | Package: ${payload.packageName} | MRR: $${payload.mrr?.toFixed(2)}/mo | Term: ${payload.contractTerm} months`,
          }
        });
        break;

      case 'update':
        url    = `${HUBSPOT_BASE}/crm/v3/objects/deals/${payload.dealId}`;
        method = 'PATCH';
        reqBody = JSON.stringify({
          properties: {
            amount:      payload.contractValue?.toFixed(2),
            description: `FerrumIT Quote ${payload.quoteNumber} | Package: ${payload.packageName} | MRR: $${payload.mrr?.toFixed(2)}/mo | Term: ${payload.contractTerm} months`,
          }
        });
        break;

      case 'get':
        url    = `${HUBSPOT_BASE}/crm/v3/objects/deals/${payload.dealId}?properties=dealname,dealstage,amount,closedate`;
        method = 'GET';
        break;

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    const fetchOpts = { method, headers };
    if (reqBody) fetchOpts.body = reqBody;

    const res = await fetch(url, fetchOpts);
    const data = await res.json();

    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};

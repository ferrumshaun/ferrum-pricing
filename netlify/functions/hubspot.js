// Netlify serverless function — proxies HubSpot API calls server-side
// Avoids CORS issues that occur when calling HubSpot directly from the browser

const HUBSPOT_BASE = 'https://api.hubapi.com';

async function hs(token, method, path, body) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${HUBSPOT_BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, token, payload } = body;
  if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'No token provided' }) };

  try {
    let result;

    switch (action) {

      // ── Test connection ────────────────────────────────────────────────────
      case 'test': {
        const r = await hs(token, 'GET', '/crm/v3/objects/deals?limit=1');
        return { statusCode: r.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(r.data) };
      }

      // ── Search open deals ──────────────────────────────────────────────────
      case 'search': {
        const filters = [
          { propertyName: 'dealstage', operator: 'NOT_IN', values: ['closedlost', 'closedwon'] }
        ];
        if (payload.query) {
          filters.push({ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: payload.query });
        }
        const r = await hs(token, 'POST', '/crm/v3/objects/deals/search', {
          filterGroups: [{ filters }],
          properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline'],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: 20
        });
        return { statusCode: r.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(r.data) };
      }

      // ── Get full deal with associated company + contact ────────────────────
      case 'get_deal_full': {
        const { dealId } = payload;

        // 1. Get deal properties
        const dealRes = await hs(token, 'GET',
          `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,amount,closedate,description`);
        if (dealRes.status !== 200) {
          return { statusCode: dealRes.status, body: JSON.stringify(dealRes.data) };
        }
        const deal = dealRes.data;

        // 2. Get associated companies
        const compAssoc = await hs(token, 'GET',
          `/crm/v3/objects/deals/${dealId}/associations/companies`);
        let company = null;
        if (compAssoc.data?.results?.length > 0) {
          const compId = compAssoc.data.results[0].id;
          const compRes = await hs(token, 'GET',
            `/crm/v3/objects/companies/${compId}?properties=name,address,address2,city,state,zip,country,phone,domain`);
          if (compRes.status === 200) company = compRes.data.properties;
        }

        // 3. Get associated contacts
        const contAssoc = await hs(token, 'GET',
          `/crm/v3/objects/deals/${dealId}/associations/contacts`);
        let contact = null;
        if (contAssoc.data?.results?.length > 0) {
          const contId = contAssoc.data.results[0].id;
          const contRes = await hs(token, 'GET',
            `/crm/v3/objects/contacts/${contId}?properties=firstname,lastname,email,phone,jobtitle`);
          if (contRes.status === 200) contact = contRes.data.properties;
        }

        result = {
          deal: deal.properties,
          dealId: deal.id,
          company,
          contact,
          dealUrl: `https://app.hubspot.com/contacts/deals/${deal.id}`
        };
        break;
      }

      // ── Create deal ────────────────────────────────────────────────────────
      case 'create': {
        const closeDate = new Date();
        closeDate.setDate(closeDate.getDate() + 30);
        const r = await hs(token, 'POST', '/crm/v3/objects/deals', {
          properties: {
            dealname:    `${payload.clientName} — ${payload.packageName}`,
            amount:      payload.contractValue?.toFixed(2),
            closedate:   closeDate.toISOString().split('T')[0],
            dealstage:   'appointmentscheduled',
            pipeline:    'default',
            description: `FerrumIT Quote ${payload.quoteNumber} | Package: ${payload.packageName} | MRR: $${payload.mrr?.toFixed(2)}/mo | Term: ${payload.contractTerm} months`,
          }
        });
        result = { ...r.data, dealUrl: `https://app.hubspot.com/contacts/deals/${r.data.id}` };
        return { statusCode: r.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(result) };
      }

      // ── Update deal ────────────────────────────────────────────────────────
      case 'update': {
        const r = await hs(token, 'PATCH', `/crm/v3/objects/deals/${payload.dealId}`, {
          properties: {
            amount:      payload.contractValue?.toFixed(2),
            description: `FerrumIT Quote ${payload.quoteNumber} | Package: ${payload.packageName} | MRR: $${payload.mrr?.toFixed(2)}/mo | Term: ${payload.contractTerm} months`,
          }
        });
        return { statusCode: r.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(r.data) };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

// Netlify serverless function — proxies HubSpot API calls server-side
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

// Fetch all pipeline stages and return a stageId → label map
async function getStageLabelMap(token) {
  const r = await hs(token, 'GET', '/crm/v3/pipelines/deals');
  const map = {};
  if (r.status === 200 && r.data.results) {
    for (const pipeline of r.data.results) {
      for (const stage of (pipeline.stages || [])) {
        map[stage.id] = stage.label;
      }
    }
  }
  return map;
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

      // ── Test connection ──────────────────────────────────────────────────
      case 'test': {
        const r = await hs(token, 'GET', '/crm/v3/objects/deals?limit=1');
        return { statusCode: r.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(r.data) };
      }

      // ── Search open deals ────────────────────────────────────────────────
      case 'search': {
        // First get the stage map so we can identify closed stages by label
        const stageMap = await getStageLabelMap(token);

        // Find stage IDs whose labels indicate closed (won or lost)
        const closedStageIds = Object.entries(stageMap)
          .filter(([, label]) => {
            const l = label.toLowerCase();
            return l.includes('closed') || l.includes('lost') || l.includes('won');
          })
          .map(([id]) => id);

        // Search without stage filter — we'll filter client-side by label
        // (HubSpot NOT_IN filter is unreliable with custom stage IDs)
        const searchBody = {
          filterGroups: [{}],
          properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline'],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: 50
        };

        // Add name filter if query provided
        if (payload.query && payload.query.trim()) {
          searchBody.filterGroups = [{
            filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: payload.query.trim() }]
          }];
        }

        const searchRes = await hs(token, 'POST', '/crm/v3/objects/deals/search', searchBody);

        // Resolve stage labels and filter out closed deals
        if (searchRes.data.results) {
          searchRes.data.results = searchRes.data.results
            .map(deal => {
              const rawStage = deal.properties.dealstage;
              deal.properties.dealstage_label = stageMap[rawStage] || rawStage;
              return deal;
            })
            .filter(deal => {
              // Exclude if stage ID is in our closed list
              if (closedStageIds.includes(deal.properties.dealstage)) return false;
              // Also exclude by label as a safety net
              const label = (deal.properties.dealstage_label || '').toLowerCase();
              if (label.includes('closed') || label.includes('lost') || label.includes('won')) return false;
              return true;
            });
        }

        return {
          statusCode: searchRes.status,
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(searchRes.data)
        };
      }

      // ── Get full deal with company + contact ─────────────────────────────
      case 'get_deal_full': {
        const { dealId } = payload;

        const [dealRes, stageMap] = await Promise.all([
          hs(token, 'GET', `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,amount,closedate,description`),
          getStageLabelMap(token)
        ]);

        if (dealRes.status !== 200) {
          return { statusCode: dealRes.status, body: JSON.stringify(dealRes.data) };
        }

        const deal = dealRes.data;
        const rawStage = deal.properties.dealstage;
        deal.properties.dealstage_label = stageMap[rawStage] || rawStage;

        // Associated company
        // HubSpot associations API returns `id` (v3) or `toObjectId` (v4) depending on portal version
        const compAssoc = await hs(token, 'GET', `/crm/v3/objects/deals/${dealId}/associations/companies`);
        let company = null;
        if (compAssoc.data?.results?.length > 0) {
          const compId = compAssoc.data.results[0].id || compAssoc.data.results[0].toObjectId;
          if (compId) {
            const compRes = await hs(token, 'GET',
              `/crm/v3/objects/companies/${compId}?properties=name,address,address2,city,state,zip,country,phone,domain`);
            if (compRes.status === 200) {
              company = compRes.data.properties;
              // If company name is blank, fall back to deal name so recipientBiz always populates
              if (!company.name && deal.properties.dealname) {
                company.name = deal.properties.dealname;
              }
            }
          }
        }

        // Associated contact
        // Same v3/v4 ID handling
        const contAssoc = await hs(token, 'GET', `/crm/v3/objects/deals/${dealId}/associations/contacts`);
        let contact = null;
        if (contAssoc.data?.results?.length > 0) {
          const contId = contAssoc.data.results[0].id || contAssoc.data.results[0].toObjectId;
          if (contId) {
            const contRes = await hs(token, 'GET',
              `/crm/v3/objects/contacts/${contId}?properties=firstname,lastname,email,phone,jobtitle`);
            if (contRes.status === 200) contact = contRes.data.properties;
          }
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

      // ── Create deal ──────────────────────────────────────────────────────
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

      // ── Update deal ──────────────────────────────────────────────────────
      case 'update': {
        const r = await hs(token, 'PATCH', `/crm/v3/objects/deals/${payload.dealId}`, {
          properties: {
            amount:      payload.contractValue?.toFixed(2),
            description: `FerrumIT Quote ${payload.quoteNumber} | Package: ${payload.packageName} | MRR: $${payload.mrr?.toFixed(2)}/mo | Term: ${payload.contractTerm} months`,
          }
        });
        return { statusCode: r.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(r.data) };
      }

      // ── Update deal description only ──────────────────────────────────────
      case 'update_description': {
        const r = await hs(token, 'PATCH', `/crm/v3/objects/deals/${payload.dealId}`, {
          properties: { description: payload.description }
        });
        return { statusCode: r.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(r.data) };
      }

      // ── Create engagement note on a deal ─────────────────────────────────
      case 'create_note': {
        // Create the note object
        const noteRes = await hs(token, 'POST', '/crm/v3/objects/notes', {
          properties: {
            hs_note_body:      payload.body,
            hs_timestamp:      Date.now().toString(),
          }
        });
        if (noteRes.status !== 201) {
          return { statusCode: noteRes.status, headers: {'Content-Type':'application/json'}, body: JSON.stringify(noteRes.data) };
        }
        const noteId = noteRes.data.id;

        // Associate note with the deal
        await hs(token, 'PUT',
          `/crm/v3/objects/notes/${noteId}/associations/deals/${payload.dealId}/note_to_deal`, {}
        );

        result = { noteId, success: true };
        break;
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

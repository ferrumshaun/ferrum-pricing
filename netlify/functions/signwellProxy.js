// SignWell API proxy — keeps API key server-side
// Auth: X-Api-Key header
// Docs: https://developers.signwell.com/

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, payload } = body;
  // API key: env var takes precedence, falls back to pricing_settings in Supabase
  let apiKey = process.env.SIGNWELL_API_KEY;

  if (!apiKey) {
    const supabaseUrl  = process.env.REACT_APP_SUPABASE_URL;
    const supabaseKey  = process.env.REACT_APP_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/pricing_settings?key=eq.signwell_api_key&select=value`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const rows = await res.json();
        apiKey = rows?.[0]?.value || null;
      } catch {}
    }
  }

  if (!apiKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'SignWell API key not configured. Add it in Admin → Integrations → SignWell, or set SIGNWELL_API_KEY in Netlify environment variables.' }) };
  }

  const BASE = 'https://www.signwell.com/api/v1';
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  };

  try {
    switch (action) {

      // ── Send a document for signature ─────────────────────────────────────
      // payload: { name, subject, message, files: [{name, file_base64}], recipients: [{id,name,email}], fields: [[...]] }
      case 'createDocument': {
        const res = await fetch(`${BASE}/documents/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            test_mode: payload.test_mode || false,
            name:      payload.name,
            subject:   payload.subject || payload.name,
            message:   payload.message || 'Please review and sign the attached document.',
            reminders: true,
            apply_signing_order: true,
            files:      payload.files,
            recipients: payload.recipients,
            fields:     payload.fields || [],
          }),
        });
        const data = await res.json();
        if (!res.ok) console.error('SignWell error:', JSON.stringify(data));
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── Get document status ───────────────────────────────────────────────
      case 'getDocument': {
        const res = await fetch(`${BASE}/documents/${payload.documentId}/`, { headers });
        const data = await res.json();
        if (!res.ok) console.error('SignWell error:', JSON.stringify(data));
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── List documents ────────────────────────────────────────────────────
      case 'listDocuments': {
        const params = new URLSearchParams({ page: payload.page || 1, per_page: payload.per_page || 20 });
        if (payload.status) params.set('status', payload.status);
        const res = await fetch(`${BASE}/documents/?${params}`, { headers });
        const data = await res.json();
        if (!res.ok) console.error('SignWell error:', JSON.stringify(data));
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── Get completed PDF URL ─────────────────────────────────────────────
      case 'getCompletedPdf': {
        const res = await fetch(`${BASE}/documents/${payload.documentId}/completed_pdf/`, { headers });
        const data = await res.json();
        if (!res.ok) console.error('SignWell error:', JSON.stringify(data));
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── Send reminder ─────────────────────────────────────────────────────
      case 'sendReminder': {
        const res = await fetch(`${BASE}/documents/${payload.documentId}/remind/`, {
          method: 'POST', headers,
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) console.error('SignWell error:', JSON.stringify(data));
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      // ── Register webhook (call once during setup) ─────────────────────────
      case 'createWebhook': {
        const res = await fetch(`${BASE}/hooks/`, {
          method: 'POST', headers,
          body: JSON.stringify({ callback_url: payload.callbackUrl }),
        });
        const data = await res.json();
        if (!res.ok) console.error('SignWell error:', JSON.stringify(data));
        return { statusCode: res.status, body: JSON.stringify(data) };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

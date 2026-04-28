// netlify/functions/buildSignatureDocument.js
// ─────────────────────────────────────────────────────────────────────────────
// Assembles the signature-ready HTML for a quote: order summary + acceptance
// terms (admin-editable from pricing_settings) + signature block with SignWell
// text tags. Returns { html, base64, name, subject, summary }.
//
// Pull all the data server-side so the document can never be tampered with
// from the browser. The rep clicks Send, this function reads the *current*
// quote from Supabase and the *current* legal terms from pricing_settings,
// and that's exactly what gets uploaded to SignWell.
//
// Signature text tags used (require `text_tags: true` on document creation):
//   {{Sig_es_:signer1:signature}}      → client signature
//   {{*Name_es_:signer1:fullname}}     → client name (auto-filled)
//   {{Date_es_:signer1:date}}          → client signing date
//   {{Title_es_:signer1:initials}}     → optional client title input
//   (and same set for signer2 when countersign is required)
//
// Note: SignWell text-tags syntax is "{{name_es_:signerN:fieldtype}}".
// We render visually labeled boxes with these tags hidden inside.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function sbSelectOne(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}&limit=1`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbSelectMany(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) return [];
  return res.json();
}

async function getSetting(key, fallback = '') {
  const row = await sbSelectOne('pricing_settings', `key=eq.${encodeURIComponent(key)}&select=value`);
  return row?.value ?? fallback;
}

// Format helpers
const fmt$  = n => n != null ? `$${Number(n).toFixed(2)}` : '—';
const fmt$0 = n => n != null ? `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// Hash for legal terms version tracking — simple but stable
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16);
}

// ─── FlexIT Order Summary Page ────────────────────────────────────────────────
function buildFlexITSummary(quote, settings) {
  const inputs   = quote.inputs || {};
  const totals   = quote.totals || {};
  const flexHrs  = inputs.flexHours || null;
  const remoteR  = totals.remoteRate || parseFloat(settings.oos_remote_rate || 165);
  const prepay   = totals.prepayAmount || 0;
  const flexBlk  = flexHrs ? Math.round(flexHrs * remoteR) : 0;
  const upfront  = flexHrs ? flexBlk : prepay;

  // Recipient
  const clientBiz     = inputs.recipientBiz || quote.client_name || '';
  const clientContact = inputs.recipientContact || '';
  const clientEmail   = inputs.recipientEmail || '';
  const clientAddr    = inputs.recipientAddress || '';

  return `
    <section class="page summary">
      <div class="header-bar">
        <div class="hb-title">FlexIT On-Demand</div>
        <div class="hb-sub">Order &amp; Quote Summary</div>
      </div>

      <table class="kv">
        <tr><th>Quote Number</th><td>${quote.quote_number || 'DRAFT'}</td>
            <th>Date</th><td>${today()}</td></tr>
        <tr><th>Client</th><td>${escapeHtml(clientBiz)}</td>
            <th>Contact</th><td>${escapeHtml(clientContact || '—')}</td></tr>
        <tr><th>Email</th><td colspan="3">${escapeHtml(clientEmail || '—')}</td></tr>
        ${clientAddr ? `<tr><th>Address</th><td colspan="3">${escapeHtml(clientAddr)}</td></tr>` : ''}
      </table>

      <h3>Service Plan</h3>
      <p>FlexIT On-Demand provides month-to-month, T&amp;M (time and materials) IT support without long-term contractual commitment. Services are drawn against the prepayment below at the rates listed on the attached Rate Schedule.</p>

      <h3>${flexHrs ? 'Pre-Purchased Flex Block' : 'Initial Prepayment'}</h3>
      <table class="ledger">
        <thead><tr><th>Description</th><th>Quantity</th><th>Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>
          ${flexHrs ? `
            <tr>
              <td>Flex Block — ${flexHrs} hour pre-purchase</td>
              <td class="c">${flexHrs} hrs</td>
              <td class="c">${fmt$(remoteR)}/hr</td>
              <td class="r">${fmt$0(flexBlk)}</td>
            </tr>` : `
            <tr>
              <td>Initial Prepayment — Remote Support</td>
              <td class="c">${(inputs.prepayHours || 0)} hrs</td>
              <td class="c">${fmt$(remoteR)}/hr</td>
              <td class="r">${fmt$0(prepay)}</td>
            </tr>`}
          <tr class="total">
            <td colspan="3">Total Due Upon Signing</td>
            <td class="r"><strong>${fmt$0(upfront)}</strong></td>
          </tr>
        </tbody>
      </table>

      <p class="terms-note">
        Payment terms: Due in full upon agreement signing. ACH/EFT payments incur no surcharge.
        Credit card payments include a 2% convenience fee added at checkout.
        Hours from the prepayment apply against future T&amp;M work; remaining balance does not expire while service remains active.
      </p>
    </section>
  `;
}

// ─── Signature Block ──────────────────────────────────────────────────────────
function buildSignatureBlock({ countersignRequired, companySignerName, companySignerTitle }) {
  return `
    <section class="page signatures">
      <h1>Signatures</h1>
      <p>All parties agree to the terms and conditions outlined above.</p>

      <div class="sig-card">
        <div class="sig-header">✏ Client Signature</div>
        <table class="sig-grid">
          <tr><th>Full Name:</th><td>{{*Name_es_:signer1:fullname}}</td></tr>
          <tr><th>Title:</th><td>{{Title_es_:signer1}}</td></tr>
          <tr><th>Business:</th><td>{{Business_es_:signer1}}</td></tr>
          <tr><th>Signature:</th><td class="sig-line">{{Sig_es_:signer1:signature}}</td></tr>
          <tr><th>Date:</th><td>{{Date_es_:signer1:date}}</td></tr>
        </table>
      </div>

      ${countersignRequired ? `
      <div class="sig-card">
        <div class="sig-header">✏ Company Signature</div>
        <table class="sig-grid">
          <tr><th>Full Name:</th><td>${escapeHtml(companySignerName || '')}</td></tr>
          <tr><th>Title:</th><td>${escapeHtml(companySignerTitle || '')}</td></tr>
          <tr><th>Business:</th><td>Ferrum Technology Services, LLC</td></tr>
          <tr><th>Signature:</th><td class="sig-line">{{Sig_es_:signer2:signature}}</td></tr>
          <tr><th>Date:</th><td>{{Date_es_:signer2:date}}</td></tr>
        </table>
      </div>` : ''}
    </section>
  `;
}

// ─── Document HTML envelope (CSS + sections) ──────────────────────────────────
function buildFullHtml({ summaryHtml, legalHtml, signatureHtml, quoteNumber }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>FlexIT Agreement — ${escapeHtml(quoteNumber || 'DRAFT')}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #1f2937; max-width: 720px; margin: 0 auto; padding: 28px 32px; line-height: 1.55; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .header-bar { background: #0f1e3c; color: white; padding: 14px 18px; border-radius: 4px; margin-bottom: 22px; }
  .hb-title { font-size: 16pt; font-weight: 700; }
  .hb-sub { font-size: 10pt; color: #94a3b8; margin-top: 2px; }
  h1 { font-size: 18pt; margin: 4px 0 12px; }
  h2 { font-size: 13pt; margin: 22px 0 8px; color: #0f1e3c; }
  h3 { font-size: 12pt; margin: 16px 0 6px; color: #0f1e3c; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  p { margin: 0 0 12px; }
  ul { margin: 0 0 14px 18px; padding: 0; }
  ul li { margin: 4px 0; }
  a { color: #2563eb; text-decoration: underline; }
  table { width: 100%; border-collapse: collapse; }
  table.kv { margin-bottom: 14px; font-size: 10.5pt; }
  table.kv th { text-align: left; color: #6b7280; font-weight: 600; padding: 5px 8px 5px 0; vertical-align: top; width: 18%; font-size: 10pt; }
  table.kv td { padding: 5px 8px 5px 0; font-weight: 500; }
  table.ledger { font-size: 10.5pt; margin: 8px 0 18px; }
  table.ledger thead th { background: #f1f5f9; color: #475569; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.04em; padding: 7px 10px; text-align: left; border-bottom: 1px solid #cbd5e1; }
  table.ledger tbody td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  table.ledger tbody tr.total td { background: #f8fafc; border-top: 2px solid #0f1e3c; border-bottom: none; font-size: 11pt; padding: 10px; }
  table.ledger .c { text-align: center; }
  table.ledger .r { text-align: right; }
  .terms-note { font-size: 9.5pt; color: #6b7280; background: #f8fafc; border-left: 3px solid #cbd5e1; padding: 8px 12px; border-radius: 3px; margin-top: 14px; }
  .sig-card { border: 1px solid #d1d5db; border-radius: 6px; margin-bottom: 18px; overflow: hidden; }
  .sig-header { background: #f1f5f9; padding: 8px 12px; font-weight: 700; font-size: 11pt; color: #0f1e3c; border-bottom: 1px solid #d1d5db; }
  .sig-grid { font-size: 10.5pt; }
  .sig-grid th { text-align: left; color: #6b7280; font-weight: 600; padding: 7px 10px; width: 22%; vertical-align: top; }
  .sig-grid td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
  .sig-grid tr:last-child td { border-bottom: none; }
  .sig-line { min-height: 36px; }
  .legal-page h1, .legal-page h2 { color: #0f1e3c; }
  .legal-page p { font-size: 10.5pt; }
  .footer { font-size: 9pt; color: #9ca3af; text-align: center; margin-top: 22px; }
</style>
</head>
<body>

  ${summaryHtml}

  <section class="page legal-page">
    ${legalHtml}
  </section>

  ${signatureHtml}

  <div class="footer">
    Ferrum Technology Services, LLC · ferrumit.com · Document ID: ${escapeHtml(quoteNumber || 'DRAFT')}
  </div>

</body>
</html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars)' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { quoteId, countersignRequired = false } = body;
  if (!quoteId) return { statusCode: 400, body: JSON.stringify({ error: 'quoteId required' }) };

  try {
    // 1. Load quote
    const quote = await sbSelectOne('quotes', `id=eq.${quoteId}&select=*`);
    if (!quote) return { statusCode: 404, body: JSON.stringify({ error: 'Quote not found' }) };

    // 2. Load all settings we need in one go (still 1 trip — RPC could batch but this is fast enough)
    const [
      legalHtml, companySignerName, companySignerTitle,
      remoteRateDefault,
    ] = await Promise.all([
      getSetting('legal_acceptance_terms_html', '<h1>Acceptance Terms</h1><p>(Legal text not configured. Set legal_acceptance_terms_html in Admin → Documents.)</p>'),
      getSetting('legal_default_company_signer_name', 'Shaun Lang'),
      getSetting('legal_default_company_signer_title', 'CEO'),
      getSetting('oos_remote_rate', '165'),
    ]);

    const settings = {
      oos_remote_rate: remoteRateDefault,
    };

    // 3. Build sections
    const summaryHtml   = buildFlexITSummary(quote, settings);
    const signatureHtml = buildSignatureBlock({
      countersignRequired,
      companySignerName,
      companySignerTitle,
    });

    const html = buildFullHtml({
      summaryHtml,
      legalHtml,
      signatureHtml,
      quoteNumber: quote.quote_number,
    });

    // 4. Encode for SignWell
    const base64 = Buffer.from(html, 'utf8').toString('base64');
    const legalTermsHash = hashString(legalHtml);

    // 5. Document name & subject
    const clientBiz = quote.inputs?.recipientBiz || quote.client_name || 'Client';
    const name      = `FlexIT Agreement — ${clientBiz}${quote.quote_number ? ` (${quote.quote_number})` : ''}`;
    const subject   = `Action Required — Sign FlexIT Agreement · ${clientBiz}`;

    // Compact summary the modal can show without re-rendering the whole HTML
    const inputs   = quote.inputs || {};
    const totals   = quote.totals || {};
    const flexHrs  = inputs.flexHours || null;
    const remoteR  = totals.remoteRate || parseFloat(settings.oos_remote_rate || 165);
    const prepay   = totals.prepayAmount || 0;
    const flexBlk  = flexHrs ? Math.round(flexHrs * remoteR) : 0;
    const upfront  = flexHrs ? flexBlk : prepay;

    return {
      statusCode: 200,
      body: JSON.stringify({
        html,
        base64,
        name,
        subject,
        legalTermsHash,
        summary: {
          quoteNumber:    quote.quote_number,
          clientBiz,
          clientContact:  inputs.recipientContact || '',
          clientEmail:    inputs.recipientEmail || '',
          flexHours:      flexHrs,
          remoteRate:     remoteR,
          prepayAmount:   prepay,
          flexBlockPrice: flexBlk,
          upfrontAmount:  upfront,
        },
      }),
    };
  } catch (err) {
    console.error('buildSignatureDocument error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};

// netlify/functions/signwellWebhook.js
// ─────────────────────────────────────────────────────────────────────────────
// SignWell webhook receiver. Listens for document lifecycle events and:
//   - Updates quotes.inputs.signwellDocuments[] state
//   - On client signing of a flexit_quote document:
//       1. Creates a Stripe Checkout Session for the upfront amount
//       2. Emails the branded payment link to the client
//       3. Posts a HubSpot deal note
//       4. Moves the HubSpot deal to the configured "awaiting payment" stage
//
// Security: SignWell does not publish a webhook signature/HMAC scheme in their
// public docs (as of search). We use a shared secret in the URL query string
// to authenticate. Set signwell_webhook_secret in pricing_settings, and
// register the webhook URL as:
//   https://lustrous-treacle-e0ca6a.netlify.app/.netlify/functions/signwellWebhook?secret=<your-secret>
//
// Idempotency: signwellDocuments[].payment_id is checked before triggering a
// new Stripe session — if present, we skip. SignWell may retry webhooks.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Supabase REST helpers ────────────────────────────────────────────────────
function sbHeaders(extra = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra };
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
async function sbUpdate(table, query, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method:  'PATCH',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase PATCH failed: ${res.status} ${txt}`);
  }
  return res.json();
}
async function sbInsert(table, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase INSERT failed: ${res.status} ${txt}`);
  }
  return res.json();
}

async function getSettings(keys) {
  const list = keys.map(k => `"${k}"`).join(',');
  const rows = await sbSelectMany('pricing_settings', `key=in.(${list})&select=key,value`);
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
}

// ── Stripe API encoder (mirrors stripeProxy) ─────────────────────────────────
function stripeEncode(obj, prefix = '') {
  const parts = [];
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          parts.push(stripeEncode(item, `${fullKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(item)}`);
        }
      });
    } else if (typeof val === 'object') {
      parts.push(stripeEncode(val, fullKey));
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

async function createStripeCheckoutSession({
  stripeKey, faceAmountCents, surchargeAmountCents, surchargePct,
  clientName, clientEmail, quoteNumber, quoteId, paymentRowId,
  successUrl, cancelUrl, statementDescriptor,
}) {
  const lineItems = [
    {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: faceAmountCents,
        product_data: {
          name: `Initial Onboarding Prepayment${clientName ? ` — ${clientName}` : ''}`,
          description: `${quoteNumber ? `Quote ${quoteNumber} · ` : ''}Payment #1 (non-refundable) · Auto-triggered on contract signing`,
        },
      },
    },
  ];
  if (surchargeAmountCents > 0) {
    const pctLabel = surchargePct ? `${(surchargePct * 100).toFixed(1).replace(/\.0$/, '')}%` : '2%';
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: surchargeAmountCents,
        product_data: {
          name: 'Card processing convenience fee',
          description: `${pctLabel} of prepayment · waived for ACH/EFT (use ferrumit.com/billing)`,
        },
      },
    });
  }

  const body = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: lineItems,
    customer_email: clientEmail,
    client_reference_id: paymentRowId,
    metadata: {
      quote_id: quoteId || '', quote_number: quoteNumber || '',
      quote_type: 'flex', payment_row_id: paymentRowId,
      face_amount_cents: String(faceAmountCents),
      surcharge_amount_cents: String(surchargeAmountCents || 0),
      auto_triggered_by: 'signwell_webhook',
    },
    payment_intent_data: {
      description: `Ferrum IQ Prepayment${quoteNumber ? ` · ${quoteNumber}` : ''}${clientName ? ` · ${clientName}` : ''}`,
      statement_descriptor_suffix: (statementDescriptor || 'FERRUM IT').slice(0, 22),
      metadata: { quote_id: quoteId || '', quote_number: quoteNumber || '', payment_row_id: paymentRowId },
    },
    invoice_creation: { enabled: true },
    success_url: successUrl, cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + (23 * 60 * 60),
    allow_promotion_codes: false, billing_address_collection: 'required',
  };

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Stripe-Version': '2024-06-20',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeEncode(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe error: ${data?.error?.message || `HTTP ${res.status}`}`);
  }
  return data;
}

// ── Email branded payment link via existing sendEmail Netlify function ───────
async function sendPaymentEmail({
  clientEmail, clientName, recipientContact, quoteNumber,
  checkoutUrl, faceAmountCents, surchargeAmountCents, totalChargedCents, surchargePct,
}) {
  const fmt = (c) => `$${(c / 100).toFixed(2)}`;
  const pctLabel = surchargePct ? `${(surchargePct * 100).toFixed(1).replace(/\.0$/, '')}%` : '2%';
  const subject = `Action Required — Initial Prepayment · ${quoteNumber || clientName}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="background:#0f1e3c;padding:16px 20px;border-radius:6px 6px 0 0;">
        <span style="color:white;font-weight:700;font-size:16px;">Ferrum Technology Services</span>
      </div>
      <div style="background:#f8fafc;padding:24px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;">
        <p style="font-size:14px;margin:0 0 14px;">Hello${recipientContact ? ` ${recipientContact}` : ''},</p>
        <p style="font-size:14px;line-height:1.7;margin:0 0 16px;">
          Thank you for signing the FlexIT agreement. To complete onboarding and begin services, please remit the initial prepayment shown below.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:13px;">
          <tr><td style="padding:6px 0;color:#6b7280;">Quote</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${quoteNumber || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Initial Prepayment</td><td style="padding:6px 0;text-align:right;">${fmt(faceAmountCents)}</td></tr>
          ${surchargeAmountCents > 0 ? `<tr><td style="padding:6px 0;color:#6b7280;">Card processing fee (${pctLabel})</td><td style="padding:6px 0;text-align:right;">${fmt(surchargeAmountCents)}</td></tr>` : ''}
          <tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;">Total due by card</td><td style="padding:8px 0;text-align:right;font-weight:700;font-size:15px;">${fmt(totalChargedCents)}</td></tr>
        </table>
        <div style="text-align:center;margin:22px 0;">
          <a href="${checkoutUrl}" style="background:#635bff;color:white;padding:13px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;display:inline-block;">
            Pay by Credit Card →
          </a>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;margin:18px 0 0;font-size:12px;line-height:1.6;color:#374151;">
          <strong style="color:#0f1e3c;">Prefer to pay by ACH/EFT?</strong><br/>
          ACH transfers are <strong style="color:#166534;">free</strong> — no card surcharge applies. Visit
          <a href="https://ferrumit.com/billing" style="color:#2563eb;">ferrumit.com/billing</a>
          or contact <a href="mailto:billing@ferrumit.com" style="color:#2563eb;">billing@ferrumit.com</a> for wire/ACH instructions.
        </div>
        <p style="color:#9ca3af;font-size:11px;text-align:center;margin:24px 0 0;">
          Payment is processed securely by Stripe. This link expires in 24 hours — request a fresh link from your Ferrum representative if needed.
        </p>
      </div>
    </div>
  `;

  const res = await fetch(`${publicUrl()}/.netlify/functions/sendEmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: clientEmail, subject, html }),
  });
  return res.ok;
}

// ── HubSpot helpers ──────────────────────────────────────────────────────────
async function postHubspotNote(token, dealId, body) {
  if (!token || !dealId) return false;
  // Mirrors the create_note action shape from the existing hubspot Netlify function
  const res = await fetch(`${publicUrl()}/.netlify/functions/hubspot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_note', token, payload: { dealId, body } }),
  });
  return res.ok;
}

async function moveHubspotStage(token, dealId, stageId) {
  if (!token || !dealId || !stageId) return false;
  // Use update_deal_property to write dealstage
  const res = await fetch(`${publicUrl()}/.netlify/functions/hubspot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update_deal_property', token,
      payload: { dealId, propertyName: 'dealstage', propertyValue: stageId },
    }),
  });
  return res.ok;
}

// Compute the public URL of the Netlify site for self-calling other functions
function publicUrl() {
  return process.env.URL || process.env.DEPLOY_URL || 'https://lustrous-treacle-e0ca6a.netlify.app';
}

// ── Find the quote that owns a SignWell document ─────────────────────────────
async function findQuoteByDocumentId(documentId) {
  // signwellDocuments is JSONB array. Use a containment query.
  // We need any quote whose inputs.signwellDocuments contains an entry with id = documentId.
  // Postgres jsonb @> with array form: '{"signwellDocuments":[{"id":"<docId>"}]}'
  const containsExpr = encodeURIComponent(JSON.stringify({ signwellDocuments: [{ id: documentId }] }));
  const url = `${SUPABASE_URL}/rest/v1/quotes?inputs=cs.${containsExpr}&select=id,quote_number,client_name,inputs,hubspot_deal_id&limit=1`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) {
    console.warn('findQuoteByDocumentId failed:', res.status, await res.text());
    return null;
  }
  const rows = await res.json();
  return rows?.[0] || null;
}

// ── Update the document entry in the quote's signwellDocuments array ─────────
async function updateDocEntry(quote, documentId, patch) {
  const docs = quote.inputs?.signwellDocuments || [];
  const idx  = docs.findIndex(d => d.id === documentId);
  if (idx < 0) return null;
  const updated = [...docs];
  updated[idx] = { ...updated[idx], ...patch };
  await sbUpdate('quotes', `id=eq.${quote.id}`, {
    inputs: { ...(quote.inputs || {}), signwellDocuments: updated },
  });
  return updated[idx];
}

// ── Auto-payment: trigger Stripe Checkout + email + HubSpot ──────────────────
async function triggerAutoPayment({ quote, docEntry, settings }) {
  const stripeKey = settings.stripe_secret_key;
  if (!stripeKey) {
    console.warn('Auto-payment skipped: stripe_secret_key not configured');
    return { skipped: true, reason: 'Stripe key not configured' };
  }

  if (settings.flexit_auto_payment_after_sign === 'false') {
    console.log('Auto-payment skipped: flexit_auto_payment_after_sign is false');
    return { skipped: true, reason: 'Auto-payment disabled in settings' };
  }

  // Idempotency: don't re-trigger if a payment_id is already on the doc entry
  if (docEntry.payment_id) {
    console.log('Auto-payment skipped: payment already created (idempotency)');
    return { skipped: true, reason: 'Payment already exists', paymentId: docEntry.payment_id };
  }

  // Compute amounts. The doc entry stores upfront_amount in dollars.
  const upfrontDollars     = docEntry.upfront_amount || 0;
  if (upfrontDollars <= 0) {
    console.warn('Auto-payment skipped: upfront_amount is zero or missing');
    return { skipped: true, reason: 'Upfront amount missing' };
  }
  const surchargePct       = parseFloat(settings.payment_cc_surcharge || '0.02');
  const faceAmountCents    = Math.round(upfrontDollars * 100);
  const surchargeCents     = Math.round(upfrontDollars * surchargePct * 100);
  const totalChargedCents  = faceAmountCents + surchargeCents;

  const inputs = quote.inputs || {};
  const clientBiz     = inputs.recipientBiz || quote.client_name || 'Client';
  const clientContact = inputs.recipientContact || '';
  const clientEmail   = docEntry.client_email || inputs.recipientEmail;

  // 1. Insert stripe_payments row
  const [paymentRow] = await sbInsert('stripe_payments', {
    quote_id:                quote.id,
    quote_type:              'flex',
    quote_number:            quote.quote_number,
    client_name:             clientBiz,
    client_email:            clientEmail,
    face_amount_cents:       faceAmountCents,
    surcharge_pct:           surchargePct,
    surcharge_amount_cents:  surchargeCents,
    total_charged_cents:     totalChargedCents,
    mode:                    settings.stripe_mode || 'test',
    status:                  'pending',
    hubspot_deal_id:         quote.hubspot_deal_id || null,
  });

  if (!paymentRow?.id) throw new Error('Failed to insert stripe_payments row');

  // 2. Create the Stripe Checkout session
  const origin = publicUrl();
  const session = await createStripeCheckoutSession({
    stripeKey,
    faceAmountCents, surchargeAmountCents: surchargeCents, surchargePct,
    clientName:    clientBiz,
    clientEmail,
    quoteNumber:   quote.quote_number,
    quoteId:       quote.id,
    paymentRowId:  paymentRow.id,
    successUrl:    `${origin}/pay/{CHECKOUT_SESSION_ID}?status=success`,
    cancelUrl:     `${origin}/pay/{CHECKOUT_SESSION_ID}?status=cancelled`,
    statementDescriptor: settings.stripe_statement_desc || 'FERRUM IT PREPAY',
  });

  // 3. Persist Stripe details on the payment row
  await sbUpdate('stripe_payments', `id=eq.${paymentRow.id}`, {
    stripe_session_id: session.id,
    checkout_url:      session.url,
    expires_at:        session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    email_sent_to:     clientEmail,
    email_sent_at:     new Date().toISOString(),
  });

  // 4. Email the client
  const emailOk = await sendPaymentEmail({
    clientEmail, clientName: clientBiz, recipientContact: clientContact,
    quoteNumber: quote.quote_number, checkoutUrl: session.url,
    faceAmountCents, surchargeAmountCents: surchargeCents, totalChargedCents, surchargePct,
  });

  // 5. Link payment_id back into the signwellDocuments entry (idempotency anchor)
  await updateDocEntry(quote, docEntry.id, { payment_id: paymentRow.id });

  return { skipped: false, paymentId: paymentRow.id, checkoutUrl: session.url, emailOk };
}

// ── HubSpot post-sign actions ────────────────────────────────────────────────
async function fireHubspotOnSign({ quote, docEntry, settings, autoPayResult }) {
  const token   = settings.hubspot_token;
  const dealId  = quote.hubspot_deal_id;
  if (!token || !dealId) return;

  // 1. Deal note
  const noteParts = [
    `${quote.quote_number || 'FlexIT quote'} — ${quote.client_name || ''}`,
    `Client signed FlexIT agreement (SignWell document ${docEntry.id})`,
  ];
  if (autoPayResult?.skipped) {
    noteParts.push(`Auto-payment NOT triggered: ${autoPayResult.reason}`);
  } else if (autoPayResult?.checkoutUrl) {
    noteParts.push(`Stripe payment link automatically generated and emailed to ${docEntry.client_email}.`);
    noteParts.push(`Checkout URL: ${autoPayResult.checkoutUrl}`);
  }
  const noteBody = noteParts.join('\n');
  await postHubspotNote(token, dealId, noteBody);

  // 2. Stage update if configured
  const stageId = settings.hubspot_stage_awaiting_payment;
  if (stageId) {
    await moveHubspotStage(token, dealId, stageId);
  }
}

// ── Main webhook handler ─────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  // ── Authenticate via shared secret in query ──
  const querySecret = event.queryStringParameters?.secret;
  const settings = await getSettings([
    'signwell_webhook_secret',
    'stripe_secret_key', 'stripe_mode', 'stripe_statement_desc', 'payment_cc_surcharge',
    'hubspot_token', 'hubspot_stage_awaiting_payment', 'hubspot_stage_closed_won',
    'flexit_auto_payment_after_sign',
  ]);
  const expectedSecret = settings.signwell_webhook_secret;
  if (expectedSecret) {
    if (!querySecret || querySecret !== expectedSecret) {
      console.warn('signwellWebhook: secret mismatch or missing — rejecting');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  } else {
    console.warn('signwellWebhook: no signwell_webhook_secret configured — accepting webhook (insecure)');
  }

  // ── Parse the SignWell payload ──
  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  // SignWell payload shape (per their docs / examples):
  // { event: { type: 'document_signed' | 'document_completed' | etc., data: { object: { id, status, recipients, ... } } } }
  // OR a flatter shape: { type: '...', data: { ... } }
  // Defensive parsing:
  const eventType =
    payload?.event?.type ||
    payload?.type ||
    payload?.event_type ||
    null;

  const docObj =
    payload?.event?.data?.object ||
    payload?.data?.object ||
    payload?.data ||
    payload?.document ||
    null;

  const documentId = docObj?.id || payload?.document_id;

  console.log(`signwellWebhook: event=${eventType} document=${documentId}`);

  if (!eventType || !documentId) {
    console.warn('Could not extract event type or document id from payload:', JSON.stringify(payload).slice(0, 500));
    // Still return 200 so SignWell doesn't retry forever
    return { statusCode: 200, body: JSON.stringify({ received: true, processed: false, reason: 'Unrecognized payload shape' }) };
  }

  // ── Find the owning quote ──
  const quote = await findQuoteByDocumentId(documentId);
  if (!quote) {
    console.log(`signwellWebhook: no quote owns document ${documentId} — likely a non-FlexIT doc (LOA/IntlWaiver/etc.)`);
    return { statusCode: 200, body: JSON.stringify({ received: true, processed: false, reason: 'Document not associated with any quote' }) };
  }

  const docs = quote.inputs?.signwellDocuments || [];
  const docEntry = docs.find(d => d.id === documentId);
  if (!docEntry) {
    return { statusCode: 200, body: JSON.stringify({ received: true, processed: false, reason: 'Doc entry not found' }) };
  }

  // We only auto-fire payment for flexit_quote type
  if (docEntry.type !== 'flexit_quote') {
    console.log(`signwellWebhook: document ${documentId} is type "${docEntry.type}" — not a FlexIT quote, no auto-payment`);
    // Still update status though
    await updateDocEntry(quote, documentId, { status: normalizeStatus(eventType) });
    return { statusCode: 200, body: JSON.stringify({ received: true, processed: true, autoPay: false }) };
  }

  // ── Route by event type ──
  const swStatus = normalizeStatus(eventType);
  const isClientSignEvent =
    eventType === 'document_signed' ||
    eventType === 'document.signed'  ||
    eventType === 'signed';

  const isCompleted =
    eventType === 'document_completed' ||
    eventType === 'document.completed' ||
    eventType === 'completed';

  const isDeclined  = eventType?.includes('declined');
  const isViewed    = eventType?.includes('viewed');

  // Determine whether the CLIENT (signer id=1) has signed.
  // SignWell payload may include `recipients` array; check for client signing event.
  const recipients = docObj?.recipients || [];
  const clientRec  = recipients.find(r => String(r.id) === '1');
  const clientSigned = clientRec?.status === 'signed' || clientRec?.signed_at != null;

  // Update the doc entry status
  const patch = { status: swStatus };
  if (isCompleted) {
    patch.completed_at = new Date().toISOString();
    patch.completed_pdf_url = docObj?.completed_pdf_url || patch.completed_pdf_url;
  }
  if (clientSigned && !docEntry.signed_at) {
    patch.signed_at = clientRec?.signed_at || new Date().toISOString();
  }
  // Has the company countersigner signed?
  const companyRec = recipients.find(r => String(r.id) === '2');
  if (companyRec && (companyRec.status === 'signed' || companyRec.signed_at)) {
    patch.countersigned = true;
  }
  await updateDocEntry(quote, documentId, patch);

  // ── Trigger auto-payment when the CLIENT has signed (per design: don't wait for countersign) ──
  // We fire on either "document_signed" with client signature, or on "document_completed" if we somehow missed the signed event.
  let autoPayResult = null;
  if ((isClientSignEvent || isCompleted) && clientSigned) {
    try {
      // Refresh the doc entry to get the latest state (including any payment_id from a previous retry)
      const refreshed = await sbSelectOne('quotes', `id=eq.${quote.id}&select=inputs`);
      const latestDoc = (refreshed?.inputs?.signwellDocuments || []).find(d => d.id === documentId);
      if (latestDoc) {
        autoPayResult = await triggerAutoPayment({
          quote: { ...quote, inputs: refreshed.inputs },
          docEntry: latestDoc,
          settings,
        });
      }
    } catch (err) {
      console.error('Auto-payment failed:', err);
      autoPayResult = { skipped: true, reason: 'Error: ' + err.message };
    }
  }

  // ── HubSpot side effects (only for client-sign events on flexit_quote) ──
  if ((isClientSignEvent || isCompleted) && clientSigned) {
    try {
      await fireHubspotOnSign({ quote, docEntry, settings, autoPayResult });
    } catch (err) {
      console.error('HubSpot side effects failed:', err);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      received:   true,
      processed:  true,
      eventType,
      documentId,
      quoteId:    quote.id,
      clientSigned,
      autoPay:    autoPayResult,
    }),
  };
};

function normalizeStatus(eventType) {
  if (!eventType) return null;
  const t = String(eventType).toLowerCase();
  if (t.includes('completed')) return 'completed';
  if (t.includes('signed'))    return 'signed';
  if (t.includes('viewed'))    return 'viewed';
  if (t.includes('declined'))  return 'declined';
  if (t.includes('cancelled')) return 'cancelled';
  if (t.includes('expired'))   return 'expired';
  if (t.includes('sent'))      return 'sent';
  if (t.includes('reminder'))  return 'sent';   // keep status as-was
  return null;
}

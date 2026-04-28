// netlify/functions/stripeWebhook.js
// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook endpoint. Verifies signature with HMAC-SHA256 (no SDK needed)
// and updates stripe_payments rows in Supabase based on event type.
//
// Register this URL in Stripe Dashboard → Developers → Webhooks:
//   https://lustrous-treacle-e0ca6a.netlify.app/.netlify/functions/stripeWebhook
//
// Listen for at minimum:
//   checkout.session.completed
//   checkout.session.expired
//   payment_intent.payment_failed
//   charge.refunded
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

// ─── Signature verification (replicates stripe.webhooks.constructEvent) ──────
function verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader) throw new Error('Missing Stripe-Signature header');
  if (!secret) throw new Error('Webhook secret not configured');

  const parts = {};
  signatureHeader.split(',').forEach(p => {
    const [k, v] = p.split('=');
    if (k && v) parts[k.trim()] = (parts[k.trim()] || []).concat(v.trim());
  });

  const timestamp = parseInt(parts.t?.[0], 10);
  const sigs = parts.v1 || [];
  if (!timestamp || sigs.length === 0) throw new Error('Malformed Stripe-Signature header');

  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) {
    throw new Error('Webhook timestamp outside tolerance window — possible replay');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  const match = sigs.some(s => {
    try {
      return crypto.timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(expected, 'hex'));
    } catch { return false; }
  });

  if (!match) throw new Error('Stripe signature mismatch');
}

// ─── Supabase REST helpers (no SDK to keep this function lean) ───────────────
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function sbSelect(table, query) {
  const url = `${process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: sbHeaders() });
  return res.ok ? res.json() : null;
}

async function sbUpdate(table, query, body) {
  const url = `${process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase update failed: ${res.status} ${txt}`);
  }
  return res.json();
}

// ─── Get webhook secret from pricing_settings (or env) ───────────────────────
async function getWebhookSecret() {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  const rows = await sbSelect('pricing_settings', 'key=eq.stripe_webhook_secret&select=value');
  return rows?.[0]?.value || null;
}

// ─── Handlers per event type ─────────────────────────────────────────────────
async function handleCheckoutCompleted(session) {
  const paymentRowId = session.client_reference_id || session.metadata?.payment_row_id;
  if (!paymentRowId) {
    console.warn('checkout.session.completed had no payment_row_id, skipping');
    return;
  }

  const updates = {
    status:                   'paid',
    paid_at:                  new Date().toISOString(),
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    stripe_invoice_id:        typeof session.invoice === 'string' ? session.invoice : session.invoice?.id,
    total_charged_cents:      session.amount_total,
  };

  await sbUpdate('stripe_payments', `id=eq.${paymentRowId}`, updates);
  console.log(`✓ Payment ${paymentRowId} marked paid (session ${session.id})`);

  // ── v3.5.18: HubSpot side effects on payment ──
  // If the payment is linked to a HubSpot deal, post a note + move stage to closed-won.
  try {
    const paymentRows = await sbSelect('stripe_payments', `id=eq.${paymentRowId}&select=quote_number,client_name,total_charged_cents,hubspot_deal_id,quote_id`);
    const payment = paymentRows?.[0];
    if (!payment?.hubspot_deal_id) return;

    // Pull HubSpot config in one go
    const settingRows = await sbSelect('pricing_settings', `key=in.(hubspot_token,hubspot_stage_closed_won)&select=key,value`);
    const sm = {};
    (settingRows || []).forEach(r => { sm[r.key] = r.value; });
    const token   = sm.hubspot_token;
    const stageId = sm.hubspot_stage_closed_won;
    if (!token) return;

    const origin   = process.env.URL || process.env.DEPLOY_URL || 'https://lustrous-treacle-e0ca6a.netlify.app';
    const noteBody = `${payment.quote_number || 'Quote'} — ${payment.client_name || ''}\nPayment received: $${(payment.total_charged_cents / 100).toFixed(2)} via Stripe\nStripe payment intent: ${typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || 'N/A'}`;

    // Post note
    try {
      await fetch(`${origin}/.netlify/functions/hubspot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_note', token, payload: { dealId: payment.hubspot_deal_id, body: noteBody } }),
      });
    } catch (e) { console.warn('HubSpot note failed:', e.message); }

    // Move stage if configured
    if (stageId) {
      try {
        await fetch(`${origin}/.netlify/functions/hubspot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_deal_property', token, payload: { dealId: payment.hubspot_deal_id, propertyName: 'dealstage', propertyValue: stageId } }),
        });
      } catch (e) { console.warn('HubSpot stage move failed:', e.message); }
    }
  } catch (err) {
    console.error('Stripe webhook HubSpot side effects failed:', err);
  }
}

async function handleCheckoutExpired(session) {
  const paymentRowId = session.client_reference_id || session.metadata?.payment_row_id;
  if (!paymentRowId) return;
  await sbUpdate('stripe_payments', `id=eq.${paymentRowId}&status=eq.pending`, {
    status: 'expired',
  });
  console.log(`Session ${session.id} expired → payment ${paymentRowId}`);
}

async function handlePaymentFailed(intent) {
  const paymentRowId = intent.metadata?.payment_row_id;
  if (!paymentRowId) return;
  const failureMsg = intent.last_payment_error?.message || intent.last_payment_error?.code || 'Card declined';
  await sbUpdate('stripe_payments', `id=eq.${paymentRowId}`, {
    status:         'failed',
    failure_reason: failureMsg,
  });
  console.log(`Payment ${paymentRowId} failed: ${failureMsg}`);
}

async function handleChargeRefunded(charge) {
  // Find row by payment_intent_id
  const piId = charge.payment_intent;
  if (!piId) return;
  const reason = charge.refunds?.data?.[0]?.reason || 'requested_by_customer';
  await sbUpdate('stripe_payments', `stripe_payment_intent_id=eq.${piId}`, {
    status:        'refunded',
    refunded_at:   new Date().toISOString(),
    refund_reason: reason,
  });
  console.log(`Charge ${charge.id} refunded`);
}

// ─── Main handler ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const rawBody = event.body || '';
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  let secret;
  try { secret = await getWebhookSecret(); }
  catch (e) { return { statusCode: 500, body: `Failed to load webhook secret: ${e.message}` }; }

  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  try {
    verifyStripeSignature(rawBody, sig, secret);
  } catch (e) {
    console.error('Signature verification failed:', e.message);
    return { statusCode: 400, body: `Webhook Error: ${e.message}` };
  }

  let stripeEvent;
  try { stripeEvent = JSON.parse(rawBody); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  console.log(`Stripe webhook: ${stripeEvent.type} (${stripeEvent.id})`);

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;

      case 'checkout.session.expired':
        await handleCheckoutExpired(stripeEvent.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(stripeEvent.data.object);
        break;

      default:
        // Acknowledge unknown events — Stripe retries non-2xx responses
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 500 so Stripe retries
    return { statusCode: 500, body: `Handler error: ${err.message}` };
  }
};

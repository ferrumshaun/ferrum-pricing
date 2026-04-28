// netlify/functions/stripeProxy.js
// ─────────────────────────────────────────────────────────────────────────────
// Server-side proxy for all Stripe API calls. Keeps the secret key out of the
// browser. Pulls the key from pricing_settings (or env var as fallback).
// Mirrors the signwellProxy / sptProxy / hubspot patterns already in the repo.
// ─────────────────────────────────────────────────────────────────────────────

const STRIPE_API = 'https://api.stripe.com/v1';

// Encode an object as application/x-www-form-urlencoded with Stripe's
// bracket-notation for nested objects (e.g. line_items[0][price_data][currency])
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

async function stripeFetch(path, method, secretKey, body) {
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': '2024-06-20',
  };
  let url = `${STRIPE_API}${path}`;
  let payload;
  if (body && method !== 'GET') {
    payload = stripeEncode(body);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, { method, headers, body: payload });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.code || `Stripe HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.stripeError = data?.error;
    throw err;
  }
  return data;
}

// Pull Stripe credentials from Supabase pricing_settings (or env var fallback)
async function getStripeConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const envKey      = process.env.STRIPE_SECRET_KEY;
  const envMode     = process.env.STRIPE_MODE;
  const envStmt     = process.env.STRIPE_STATEMENT_DESCRIPTOR;

  // Env var takes precedence
  if (envKey) {
    return { secretKey: envKey, mode: envMode || 'test', statementDescriptor: envStmt || 'FERRUM IT PREPAY' };
  }

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in Netlify env, or SUPABASE_SERVICE_ROLE_KEY so the proxy can read pricing_settings.');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/pricing_settings?key=in.(stripe_secret_key,stripe_mode,stripe_statement_desc)&select=key,value`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const rows = await res.json();
  const map = {};
  (rows || []).forEach(r => { map[r.key] = r.value; });

  if (!map.stripe_secret_key) {
    throw new Error('Stripe secret key not configured. Go to Admin → Integrations → Stripe to add it.');
  }

  return {
    secretKey:           map.stripe_secret_key,
    mode:                map.stripe_mode || 'test',
    statementDescriptor: map.stripe_statement_desc || 'FERRUM IT PREPAY',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, payload = {} } = body;

  let cfg;
  try { cfg = await getStripeConfig(); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: e.message }) }; }

  try {
    switch (action) {

      // ─── Test connection ─────────────────────────────────────────────────
      case 'testConnection': {
        const data = await stripeFetch('/balance', 'GET', cfg.secretKey);
        return ok({ ok: true, livemode: data.livemode, mode: cfg.mode });
      }

      // ─── Create a one-time Checkout Session for a prepayment ─────────────
      case 'createCheckoutSession': {
        const {
          faceAmountCents,        // base prepay amount in cents
          surchargeAmountCents,   // 2% (or whatever) in cents
          surchargePct,           // e.g. 0.02 — for the description
          clientName,
          clientEmail,
          quoteNumber,
          quoteId,
          quoteType,
          paymentRowId,           // Supabase stripe_payments.id — the source of truth
          successUrl,
          cancelUrl,
        } = payload;

        if (!faceAmountCents || faceAmountCents <= 0)  return bad('faceAmountCents required and > 0');
        if (!clientEmail)                              return bad('clientEmail required');
        if (!paymentRowId)                             return bad('paymentRowId required');

        const lineItems = [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: faceAmountCents,
              product_data: {
                name: `Initial Onboarding Prepayment${clientName ? ` — ${clientName}` : ''}`,
                description: `${quoteNumber ? `Quote ${quoteNumber} · ` : ''}Payment #1 (non-refundable)`,
              },
            },
          },
        ];

        if (surchargeAmountCents && surchargeAmountCents > 0) {
          const pctLabel = surchargePct ? `${(surchargePct * 100).toFixed(1).replace(/\.0$/, '')}%` : '2%';
          lineItems.push({
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: surchargeAmountCents,
              product_data: {
                name: 'Card processing convenience fee',
                description: `${pctLabel} of prepayment · waived for ACH/EFT (use the billing portal at ferrumit.com/billing for free ACH)`,
              },
            },
          });
        }

        const session = await stripeFetch('/checkout/sessions', 'POST', cfg.secretKey, {
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: lineItems,
          customer_email: clientEmail,
          client_reference_id: paymentRowId,
          metadata: {
            quote_id:               quoteId || '',
            quote_number:           quoteNumber || '',
            quote_type:             quoteType || '',
            payment_row_id:         paymentRowId,
            face_amount_cents:      String(faceAmountCents),
            surcharge_amount_cents: String(surchargeAmountCents || 0),
          },
          payment_intent_data: {
            description: `Ferrum IQ Prepayment${quoteNumber ? ` · ${quoteNumber}` : ''}${clientName ? ` · ${clientName}` : ''}`,
            statement_descriptor_suffix: (cfg.statementDescriptor || 'FERRUM IT').slice(0, 22),
            metadata: {
              quote_id:               quoteId || '',
              quote_number:           quoteNumber || '',
              payment_row_id:         paymentRowId,
            },
          },
          invoice_creation: { enabled: true },
          success_url: successUrl,
          cancel_url:  cancelUrl,
          // 24h is Stripe's max; we'll let our DB row drive longer expiries via resend.
          expires_at: Math.floor(Date.now() / 1000) + (23 * 60 * 60),
          allow_promotion_codes: false,
          billing_address_collection: 'required',
        });

        return ok({
          id:            session.id,
          url:           session.url,
          expires_at:    session.expires_at,
          payment_intent: session.payment_intent,
          mode:          cfg.mode,
        });
      }

      // ─── Look up an existing Checkout Session (status, payment intent) ───
      case 'getCheckoutSession': {
        const { sessionId } = payload;
        if (!sessionId) return bad('sessionId required');
        const session = await stripeFetch(
          `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent&expand[]=invoice`,
          'GET',
          cfg.secretKey
        );
        return ok({
          id:                  session.id,
          status:              session.status,                 // 'open' | 'complete' | 'expired'
          payment_status:      session.payment_status,         // 'paid' | 'unpaid' | 'no_payment_required'
          amount_total:        session.amount_total,
          amount_subtotal:     session.amount_subtotal,
          currency:            session.currency,
          customer_email:      session.customer_details?.email || session.customer_email,
          customer_name:       session.customer_details?.name,
          payment_intent_id:   session.payment_intent?.id || session.payment_intent,
          invoice_id:          session.invoice?.id || session.invoice,
          receipt_url:         session.payment_intent?.charges?.data?.[0]?.receipt_url || null,
          charge_id:           session.payment_intent?.latest_charge || null,
          url:                 session.url,
          expires_at:          session.expires_at,
          metadata:            session.metadata || {},
        });
      }

      // ─── Expire an open session (rep cancels a payment link) ─────────────
      case 'expireCheckoutSession': {
        const { sessionId } = payload;
        if (!sessionId) return bad('sessionId required');
        const session = await stripeFetch(
          `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
          'POST',
          cfg.secretKey,
          {}
        );
        return ok({ id: session.id, status: session.status });
      }

      // ─── Issue a refund (admin only — used by future deploys) ────────────
      case 'createRefund': {
        const { paymentIntentId, amountCents, reason } = payload;
        if (!paymentIntentId) return bad('paymentIntentId required');
        const refundBody = { payment_intent: paymentIntentId };
        if (amountCents) refundBody.amount = amountCents;
        if (reason)      refundBody.reason = reason;
        const refund = await stripeFetch('/refunds', 'POST', cfg.secretKey, refundBody);
        return ok({ id: refund.id, status: refund.status, amount: refund.amount });
      }

      default:
        return bad(`Unknown action: ${action}`);
    }
  } catch (err) {
    return {
      statusCode: err.status || 500,
      body: JSON.stringify({
        error:        err.message,
        stripe_error: err.stripeError || null,
      }),
    };
  }
};

function ok(data)   { return { statusCode: 200, body: JSON.stringify(data) }; }
function bad(msg)   { return { statusCode: 400, body: JSON.stringify({ error: msg }) }; }

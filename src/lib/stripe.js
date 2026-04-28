// src/lib/stripe.js
// Client-side wrapper for Stripe operations. All calls route through the
// /.netlify/functions/stripeProxy function to keep the secret key server-side.
// Mirrors the signwell.js / smartPricingTable.js / hubspot.js patterns.

import { supabase } from './supabase';

async function stripeCall(action, payload = {}) {
  const res = await fetch('/.netlify/functions/stripeProxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.stripe_error?.message || `Stripe error ${res.status}`);
  }
  return data;
}

// ── Test connection ──────────────────────────────────────────────────────────
export async function testStripeConnection() {
  return stripeCall('testConnection');
}

// ── Create or refresh a Checkout Session for a quote prepayment ──────────────
// 1. Reads payment_cc_surcharge from pricing_settings (default 0.02)
// 2. Computes face + surcharge cents
// 3. Inserts (or updates) a stripe_payments row with status=pending
// 4. Calls stripeProxy to create a hosted Checkout Session
// 5. Returns the URL to email to the client
export async function createPrepaymentSession({
  quoteId,
  quoteType,           // 'managed-it' | 'multi-site-managed-it' | 'voice' | 'bundle' | 'flex'
  quoteNumber,
  clientName,
  clientEmail,
  prepayAmount,        // dollars (face value, ACH price)
  hubspotDealId,       // optional
  resendOfPaymentId,   // optional — if provided, refresh that row instead of inserting new
}) {
  if (!clientEmail)               throw new Error('Client email is required');
  if (!prepayAmount || prepayAmount <= 0) throw new Error('Prepayment amount must be greater than zero');

  // 1. Pull surcharge rate from pricing_settings (admin-configurable)
  const { data: surchargeRow } = await supabase
    .from('pricing_settings')
    .select('value')
    .eq('key', 'payment_cc_surcharge')
    .single();
  const surchargePct = parseFloat(surchargeRow?.value || '0.02');

  // 2. Compute cents (round to nearest cent on each leg, then total)
  const faceAmountCents      = Math.round(prepayAmount * 100);
  const surchargeAmountCents = Math.round(prepayAmount * surchargePct * 100);
  const totalChargedCents    = faceAmountCents + surchargeAmountCents;

  // 3. Get current user for created_by
  const { data: { user } } = await supabase.auth.getUser();

  // Determine current Stripe mode (just for tagging the row — proxy uses same source)
  const { data: modeRow } = await supabase
    .from('pricing_settings')
    .select('value')
    .eq('key', 'stripe_mode')
    .single();
  const mode = modeRow?.value || 'test';

  // 4. Insert or update stripe_payments row
  let paymentRow;
  if (resendOfPaymentId) {
    // Read current resend_count, then increment client-side
    const { data: existing } = await supabase
      .from('stripe_payments')
      .select('resend_count')
      .eq('id', resendOfPaymentId)
      .single();
    const nextCount = (existing?.resend_count || 0) + 1;

    const { data, error } = await supabase
      .from('stripe_payments')
      .update({
        face_amount_cents:      faceAmountCents,
        surcharge_pct:          surchargePct,
        surcharge_amount_cents: surchargeAmountCents,
        total_charged_cents:    totalChargedCents,
        client_email:           clientEmail,
        client_name:            clientName,
        status:                 'pending',
        resend_count:           nextCount,
        last_resent_at:         new Date().toISOString(),
        failure_reason:         null,
      })
      .eq('id', resendOfPaymentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update payment row: ${error.message}`);
    paymentRow = data;
  } else {
    const { data, error } = await supabase
      .from('stripe_payments')
      .insert({
        quote_id:               quoteId,
        quote_type:             quoteType,
        quote_number:           quoteNumber,
        client_name:            clientName,
        client_email:           clientEmail,
        face_amount_cents:      faceAmountCents,
        surcharge_pct:          surchargePct,
        surcharge_amount_cents: surchargeAmountCents,
        total_charged_cents:    totalChargedCents,
        mode,
        status:                 'pending',
        hubspot_deal_id:        hubspotDealId || null,
        created_by:             user?.id || null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create payment row: ${error.message}`);
    paymentRow = data;
  }

  // 5. Build success/cancel URLs — public receipt page
  const origin = window.location.origin;
  const successUrl = `${origin}/pay/{CHECKOUT_SESSION_ID}?status=success`;
  const cancelUrl  = `${origin}/pay/{CHECKOUT_SESSION_ID}?status=cancelled`;

  // 6. Create the Stripe Checkout Session via the proxy
  const session = await stripeCall('createCheckoutSession', {
    faceAmountCents,
    surchargeAmountCents,
    surchargePct,
    clientName,
    clientEmail,
    quoteNumber,
    quoteId,
    quoteType,
    paymentRowId: paymentRow.id,
    successUrl,
    cancelUrl,
  });

  // 7. Persist the session details on the row
  const expiresAt = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null;
  const { data: updated, error: upErr } = await supabase
    .from('stripe_payments')
    .update({
      stripe_session_id: session.id,
      checkout_url:      session.url,
      expires_at:        expiresAt,
    })
    .eq('id', paymentRow.id)
    .select()
    .single();
  if (upErr) console.warn('Failed to persist session details:', upErr.message);

  return {
    paymentId:  paymentRow.id,
    sessionId:  session.id,
    url:        session.url,
    expiresAt,
    faceAmountCents,
    surchargeAmountCents,
    totalChargedCents,
    surchargePct,
    mode:       session.mode || mode,
  };
}

// ── Get latest payment for a quote ───────────────────────────────────────────
export async function getLatestPaymentForQuote(quoteId) {
  if (!quoteId) return null;
  const { data, error } = await supabase
    .from('stripe_payments')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('Failed to load payment:', error.message);
    return null;
  }
  return data;
}

// ── Get payment by stripe_session_id (used by public receipt page) ───────────
export async function getPaymentBySessionId(sessionId) {
  if (!sessionId) return null;
  const { data, error } = await supabase
    .from('stripe_payments')
    .select('*')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  if (error) {
    console.warn('Failed to load payment by session:', error.message);
    return null;
  }
  return data;
}

// ── Refresh a payment from Stripe (sync DB with Stripe's truth) ──────────────
export async function refreshPaymentFromStripe(sessionId) {
  if (!sessionId) throw new Error('sessionId required');
  return stripeCall('getCheckoutSession', { sessionId });
}

// ── Expire (cancel) a pending checkout session ───────────────────────────────
export async function expireCheckoutSession(sessionId) {
  if (!sessionId) throw new Error('sessionId required');
  const result = await stripeCall('expireCheckoutSession', { sessionId });
  // Mark our DB row cancelled too
  await supabase
    .from('stripe_payments')
    .update({ status: 'cancelled' })
    .eq('stripe_session_id', sessionId)
    .eq('status', 'pending');
  return result;
}

// ── Format helpers ───────────────────────────────────────────────────────────
export const fmtCents = (c) => c == null ? '—' : `$${(c / 100).toFixed(2)}`;
export const fmtCentsWhole = (c) => c == null ? '—' : `$${Math.round(c / 100).toLocaleString()}`;

// ── Email the Checkout link to the client ────────────────────────────────────
export async function emailPaymentLink({
  paymentId,
  quoteNumber,
  clientName,
  clientEmail,
  recipientContact,
  checkoutUrl,
  faceAmountCents,
  surchargeAmountCents,
  totalChargedCents,
  surchargePct,
  customMessage,
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
          Thank you for choosing Ferrum Technology Services. To complete onboarding and begin services, please remit the initial prepayment shown below.
        </p>

        ${customMessage ? `<div style="font-size:13px;background:#fff7ed;padding:10px 14px;border-radius:4px;border-left:3px solid #f97316;margin:0 0 18px;">${customMessage}</div>` : ''}

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
          Payment is processed securely by Stripe. This link expires in 24 hours — request a fresh link from your Ferrum representative if needed.<br/>
          Reply to this email with any questions.
        </p>
      </div>
    </div>
  `;

  const res = await fetch('/.netlify/functions/sendEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: clientEmail, subject, html }),
  });

  const ok = res.ok;
  const sentAt = new Date().toISOString();

  if (ok && paymentId) {
    await supabase
      .from('stripe_payments')
      .update({ email_sent_at: sentAt, email_sent_to: clientEmail })
      .eq('id', paymentId);
  }

  return { ok, sentAt };
}

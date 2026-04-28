// src/components/StripePaymentCard.js
// Reusable card shown on every quote type's Documents panel. Lets reps
// generate a Stripe Checkout link, email it to the client, and track status.

import React, { useEffect, useState } from 'react';
import {
  createPrepaymentSession,
  getLatestPaymentForQuote,
  emailPaymentLink,
  refreshPaymentFromStripe,
  expireCheckoutSession,
  fmtCents,
} from '../lib/stripe';
import { supabase } from '../lib/supabase';

export default function StripePaymentCard({
  quoteId,
  quoteType,         // 'managed-it' | 'multi-site-managed-it' | 'voice' | 'bundle' | 'flex'
  quoteNumber,
  clientName,
  clientEmail,       // primary recipient email from the quote form
  recipientContact,  // first name for the email greeting
  prepayAmount,      // dollars
  hubspotDealId,
}) {
  const [payment, setPayment]      = useState(null);
  const [loading, setLoading]      = useState(true);
  const [busy, setBusy]            = useState(false);
  const [msg, setMsg]              = useState('');
  const [showSendForm, setShow]    = useState(false);
  const [emailOverride, setEmail]  = useState(clientEmail || '');
  const [customMessage, setCustom] = useState('');
  const [surchargePct, setSPct]    = useState(0.02);

  // Load latest payment + surcharge rate
  useEffect(() => {
    if (!quoteId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [p, { data: srow }] = await Promise.all([
        getLatestPaymentForQuote(quoteId),
        supabase.from('pricing_settings').select('value').eq('key', 'payment_cc_surcharge').single(),
      ]);
      if (cancelled) return;
      setPayment(p);
      setSPct(parseFloat(srow?.value || '0.02'));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [quoteId]);

  useEffect(() => { if (clientEmail) setEmail(clientEmail); }, [clientEmail]);

  // Live status sync — when payment is pending, poll Stripe every 8s
  useEffect(() => {
    if (!payment || payment.status !== 'pending' || !payment.stripe_session_id) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const s = await refreshPaymentFromStripe(payment.stripe_session_id);
        if (cancelled) return;
        if (s.payment_status === 'paid' || s.status === 'complete') {
          // Webhook should have already updated; reload our row
          const fresh = await getLatestPaymentForQuote(quoteId);
          setPayment(fresh);
        } else if (s.status === 'expired') {
          const fresh = await getLatestPaymentForQuote(quoteId);
          setPayment(fresh);
        }
      } catch { /* swallow polling errors */ }
    }, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [payment, quoteId]);

  const ccSurchargePct  = surchargePct;
  const faceCents       = Math.round(prepayAmount * 100);
  const surchargeCents  = Math.round(prepayAmount * ccSurchargePct * 100);
  const totalCents      = faceCents + surchargeCents;
  const pctLabel        = `${(ccSurchargePct * 100).toFixed(1).replace(/\.0$/, '')}%`;

  // ── Actions ──
  async function generateAndSend() {
    setBusy(true); setMsg('');
    try {
      const isResend = payment && (payment.status === 'expired' || payment.status === 'failed' || payment.status === 'cancelled');
      const session = await createPrepaymentSession({
        quoteId,
        quoteType,
        quoteNumber,
        clientName,
        clientEmail: emailOverride,
        prepayAmount,
        hubspotDealId,
        resendOfPaymentId: isResend ? payment.id : undefined,
      });

      const emailRes = await emailPaymentLink({
        paymentId:            session.paymentId,
        quoteNumber,
        clientName,
        clientEmail:          emailOverride,
        recipientContact,
        checkoutUrl:          session.url,
        faceAmountCents:      session.faceAmountCents,
        surchargeAmountCents: session.surchargeAmountCents,
        totalChargedCents:    session.totalChargedCents,
        surchargePct:         session.surchargePct,
        customMessage,
      });

      const fresh = await getLatestPaymentForQuote(quoteId);
      setPayment(fresh);
      setMsg(emailRes.ok ? `✓ Payment link sent to ${emailOverride}` : `⚠ Link generated but email failed — copy from card below`);
      setShow(false);
      setCustom('');
    } catch (e) {
      setMsg('✗ ' + e.message);
    }
    setBusy(false);
  }

  async function resendEmail() {
    if (!payment) return;
    setBusy(true); setMsg('');
    try {
      const res = await emailPaymentLink({
        paymentId:            payment.id,
        quoteNumber:          payment.quote_number,
        clientName:           payment.client_name,
        clientEmail:          payment.client_email,
        recipientContact,
        checkoutUrl:          payment.checkout_url,
        faceAmountCents:      payment.face_amount_cents,
        surchargeAmountCents: payment.surcharge_amount_cents,
        totalChargedCents:    payment.total_charged_cents,
        surchargePct:         payment.surcharge_pct,
        customMessage:        '',
      });
      setMsg(res.ok ? `✓ Email re-sent to ${payment.client_email}` : '✗ Email failed');
      const fresh = await getLatestPaymentForQuote(quoteId);
      setPayment(fresh);
    } catch (e) { setMsg('✗ ' + e.message); }
    setBusy(false);
  }

  async function copyLink() {
    if (!payment?.checkout_url) return;
    try {
      await navigator.clipboard.writeText(payment.checkout_url);
      setMsg('✓ Link copied to clipboard');
      setTimeout(() => setMsg(''), 2500);
    } catch { setMsg('✗ Could not copy — select and copy manually'); }
  }

  async function cancelLink() {
    if (!payment?.stripe_session_id) return;
    if (!window.confirm('Cancel this payment link? The client will no longer be able to pay through it.')) return;
    setBusy(true); setMsg('');
    try {
      await expireCheckoutSession(payment.stripe_session_id);
      const fresh = await getLatestPaymentForQuote(quoteId);
      setPayment(fresh);
      setMsg('✓ Payment link cancelled');
    } catch (e) { setMsg('✗ ' + e.message); }
    setBusy(false);
  }

  // ── No quote yet — disabled ──
  if (!quoteId) {
    return (
      <div style={cardWrap('#e5e7eb')}>
        <CardHeader />
        <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 12px' }}>
          Save the quote first to generate a payment link.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={cardWrap('#e5e7eb')}>
        <CardHeader />
        <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 12px' }}>Loading…</div>
      </div>
    );
  }

  // ── No prepayment configured — informational ──
  if (!prepayAmount || prepayAmount <= 0) {
    return (
      <div style={cardWrap('#e5e7eb')}>
        <CardHeader />
        <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 12px' }}>
          No prepayment amount on this quote.
        </div>
      </div>
    );
  }

  const isPaid       = payment?.status === 'paid';
  const isPending    = payment?.status === 'pending';
  const isExpired    = payment?.status === 'expired';
  const isCancelled  = payment?.status === 'cancelled';
  const isFailed     = payment?.status === 'failed';
  const isRefunded   = payment?.status === 'refunded';

  // Border color reflects state
  const borderColor =
    isPaid     ? '#bbf7d0'
    : isPending ? '#fde68a'
    : isFailed || isExpired || isCancelled ? '#fecaca'
    : '#e5e7eb';

  return (
    <div style={cardWrap(borderColor)}>
      <CardHeader paid={isPaid} pending={isPending} />

      {/* Amount summary */}
      <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: '#6b7280' }}>Initial Prepayment</span>
          <span style={{ fontFamily: 'DM Mono, monospace', color: '#0f1e3c' }}>{fmtCents(faceCents)}</span>
        </div>
        {surchargeCents > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: '#6b7280' }}>Card processing fee ({pctLabel})</span>
            <span style={{ fontFamily: 'DM Mono, monospace', color: '#dc2626' }}>+{fmtCents(surchargeCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, paddingTop: 4, borderTop: '1px solid #e5e7eb', marginTop: 4 }}>
          <span style={{ color: '#0f1e3c' }}>Total charged on card</span>
          <span style={{ fontFamily: 'DM Mono, monospace', color: '#0f1e3c' }}>{fmtCents(totalCents)}</span>
        </div>
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6, fontStyle: 'italic' }}>
          ACH/EFT remains free — clients pay via ferrumit.com/billing for no surcharge.
        </div>
      </div>

      {/* State-specific content */}
      {isPaid && (
        <div style={{ padding: '10px 12px', background: '#f0fdf4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>✓ Paid</span>
            <span style={{ fontSize: 10, color: '#16a34a' }}>
              {payment.paid_at && new Date(payment.paid_at).toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.6 }}>
            <div><strong>Charged:</strong> {fmtCents(payment.total_charged_cents)} · <strong>Card processing fee:</strong> {fmtCents(payment.surcharge_amount_cents)}</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#6b7280', marginTop: 2 }}>
              {payment.stripe_payment_intent_id} · {(payment.mode || 'test').toUpperCase()} mode
            </div>
          </div>
        </div>
      )}

      {isPending && (
        <div style={{ padding: '10px 12px', background: '#fffbeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#a16207' }}>● Awaiting payment</span>
            {payment.expires_at && (
              <span style={{ fontSize: 9, color: '#9ca3af' }}>
                Expires {new Date(payment.expires_at).toLocaleString()}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>
            Sent to {payment.email_sent_to || payment.client_email}
            {payment.email_sent_at && ` on ${new Date(payment.email_sent_at).toLocaleDateString()}`}
            {payment.resend_count > 0 && ` · ${payment.resend_count} resend${payment.resend_count > 1 ? 's' : ''}`}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={resendEmail} disabled={busy} style={btnPrimary}>
              {busy ? '…' : '📧 Resend Email'}
            </button>
            <button onClick={copyLink} disabled={busy} style={btnSecondary}>
              📋 Copy Link
            </button>
            <a href={payment.checkout_url} target="_blank" rel="noopener noreferrer" style={btnLink}>
              Preview ↗
            </a>
            <button onClick={cancelLink} disabled={busy} style={btnDanger}>
              Cancel Link
            </button>
          </div>
        </div>
      )}

      {(isExpired || isCancelled || isFailed) && (
        <div style={{ padding: '10px 12px', background: '#fef2f2' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
            {isExpired   && '⚠ Payment link expired'}
            {isCancelled && '⚠ Payment link cancelled'}
            {isFailed    && '✗ Payment failed'}
          </div>
          {payment.failure_reason && (
            <div style={{ fontSize: 10, color: '#7f1d1d', marginBottom: 8 }}>
              {payment.failure_reason}
            </div>
          )}
          <button onClick={() => setShow(true)} disabled={busy} style={btnPrimary}>
            Generate New Link
          </button>
        </div>
      )}

      {isRefunded && (
        <div style={{ padding: '10px 12px', background: '#f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>↩ Refunded</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {payment.refunded_at && new Date(payment.refunded_at).toLocaleString()}
            {payment.refund_reason && ` · ${payment.refund_reason}`}
          </div>
        </div>
      )}

      {/* Initial state — no payment yet */}
      {!payment && (
        <div style={{ padding: '10px 12px' }}>
          {!showSendForm ? (
            <button onClick={() => setShow(true)} disabled={busy} style={{ ...btnPrimary, width: '100%', padding: '8px 14px' }}>
              💳 Generate &amp; Send Payment Link
            </button>
          ) : (
            <SendForm
              email={emailOverride} setEmail={setEmail}
              customMessage={customMessage} setCustom={setCustom}
              busy={busy} onSend={generateAndSend}
              onCancel={() => setShow(false)}
              totalCents={totalCents}
            />
          )}
        </div>
      )}

      {/* Resend after expired/cancelled — show form */}
      {(isExpired || isCancelled || isFailed) && showSendForm && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb' }}>
          <SendForm
            email={emailOverride} setEmail={setEmail}
            customMessage={customMessage} setCustom={setCustom}
            busy={busy} onSend={generateAndSend}
            onCancel={() => setShow(false)}
            totalCents={totalCents}
          />
        </div>
      )}

      {msg && (
        <div style={{
          padding: '7px 12px',
          fontSize: 10,
          fontWeight: 600,
          color: msg.startsWith('✓') ? '#166534' : msg.startsWith('⚠') ? '#a16207' : '#dc2626',
          background: msg.startsWith('✓') ? '#f0fdf4' : msg.startsWith('⚠') ? '#fffbeb' : '#fef2f2',
          borderTop: '1px solid #e5e7eb',
        }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────
function CardHeader({ paid, pending }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', background: '#0f1e3c', borderRadius: '6px 6px 0 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, background: '#635bff', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: 'white',
        }}>S</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>Stripe Prepayment</div>
          <div style={{ fontSize: 8, color: '#9ca3af' }}>Initial onboarding · Card only</div>
        </div>
      </div>
      {paid    && <span style={{ fontSize: 9, fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '2px 7px', borderRadius: 3 }}>PAID ✓</span>}
      {pending && <span style={{ fontSize: 9, fontWeight: 700, color: '#a16207', background: '#fef3c7', padding: '2px 7px', borderRadius: 3 }}>PENDING</span>}
    </div>
  );
}

function SendForm({ email, setEmail, customMessage, setCustom, busy, onSend, onCancel, totalCents }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>
        Send to
      </label>
      <input
        value={email} onChange={e => setEmail(e.target.value)} type="email"
        placeholder="client@company.com"
        style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, marginBottom: 8, outline: 'none' }}
      />
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>
        Custom message (optional)
      </label>
      <textarea
        value={customMessage} onChange={e => setCustom(e.target.value)} rows={2}
        placeholder="e.g. Per our call today, please complete the prepayment by Friday."
        style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, marginBottom: 10, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={onSend} disabled={busy || !email} style={btnPrimary}>
          {busy ? 'Sending…' : `Send Link · ${fmtCents(totalCents)}`}
        </button>
        <button onClick={onCancel} disabled={busy} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const cardWrap = (border) => ({
  background: 'white', border: `1px solid ${border}`, borderRadius: 6,
  marginBottom: 10, overflow: 'hidden',
});
const btnPrimary = {
  padding: '6px 12px', background: '#635bff', color: 'white', border: 'none',
  borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary = {
  padding: '6px 12px', background: 'white', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const btnDanger = {
  padding: '6px 12px', background: 'white', color: '#dc2626',
  border: '1px solid #fecaca', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const btnLink = {
  padding: '6px 12px', background: 'transparent', color: '#2563eb',
  border: '1px solid #bfdbfe', borderRadius: 4, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
};

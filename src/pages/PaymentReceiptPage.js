// src/pages/PaymentReceiptPage.js
// Public, unauthenticated receipt page that clients land on after completing
// Stripe Checkout. Reads stripe_session_id from URL (set in Checkout redirect)
// and shows a Ferrum-branded confirmation. Polls Stripe in case the webhook
// hasn't landed yet.

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPaymentBySessionId, refreshPaymentFromStripe, fmtCents } from '../lib/stripe';

export default function PaymentReceiptPage() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const reportedStatus = params.get('status'); // 'success' | 'cancelled' from redirect

  const [payment, setPayment] = useState(null);
  const [stripe, setStripe]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let pollHandle = null;

    async function loadOnce() {
      try {
        const [row, sess] = await Promise.all([
          getPaymentBySessionId(sessionId),
          refreshPaymentFromStripe(sessionId).catch(() => null),
        ]);
        if (cancelled) return;
        setPayment(row);
        setStripe(sess);
        setLoading(false);

        // If webhook hasn't landed yet but Stripe says paid, poll for our DB to catch up
        if (sess?.payment_status === 'paid' && row?.status === 'pending') {
          pollHandle = setInterval(async () => {
            const fresh = await getPaymentBySessionId(sessionId);
            if (fresh?.status === 'paid' && !cancelled) {
              setPayment(fresh);
              clearInterval(pollHandle);
            }
          }, 3000);
        }
      } catch (e) {
        if (cancelled) return;
        setErr(e.message);
        setLoading(false);
      }
    }

    // Try to load the company logo (public asset stored in pricing_settings)
    fetch('/.netlify/functions/sendEmail', { method: 'OPTIONS' }).catch(() => {}); // warmup
    loadOnce();

    return () => { cancelled = true; if (pollHandle) clearInterval(pollHandle); };
  }, [sessionId]);

  // Determine effective status
  const stripeStatus = stripe?.payment_status; // 'paid' | 'unpaid'
  const dbStatus     = payment?.status;
  const isPaid       = stripeStatus === 'paid' || dbStatus === 'paid';
  const isCancelled  = reportedStatus === 'cancelled' || dbStatus === 'cancelled';
  const isExpired    = stripe?.status === 'expired' || dbStatus === 'expired';

  return (
    <div style={{
      minHeight: '100vh', background: '#f1f5f9',
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 540 }}>

        {/* Branded header */}
        <div style={{ background: '#0f1e3c', borderRadius: '8px 8px 0 0', padding: '20px 28px' }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 18 }}>
            Ferrum Technology Services
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
            Payment Confirmation
          </div>
        </div>

        {/* Body */}
        <div style={{
          background: 'white', borderRadius: '0 0 8px 8px',
          padding: '32px 28px', border: '1px solid #e5e7eb', borderTop: 'none',
        }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
              Loading your receipt…
            </div>
          )}

          {err && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '14px 18px', color: '#991b1b', fontSize: 13 }}>
              {err}
            </div>
          )}

          {!loading && !err && (
            <>
              {/* Status banner */}
              {isPaid && (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: 8, padding: '20px 22px', marginBottom: 22, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 4 }}>✓</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                    Payment Received
                  </div>
                  <div style={{ fontSize: 12, color: '#15803d' }}>
                    Thank you. Your initial prepayment has been processed.
                  </div>
                </div>
              )}

              {isCancelled && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 8, padding: '20px 22px', marginBottom: 22, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#a16207', marginBottom: 4 }}>
                    Payment Cancelled
                  </div>
                  <div style={{ fontSize: 12, color: '#92400e' }}>
                    No charge was made. You can return to the original payment link to try again.
                  </div>
                </div>
              )}

              {isExpired && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, padding: '20px 22px', marginBottom: 22, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
                    Link Expired
                  </div>
                  <div style={{ fontSize: 12, color: '#7f1d1d' }}>
                    Please contact your Ferrum representative to receive a new payment link.
                  </div>
                </div>
              )}

              {!isPaid && !isCancelled && !isExpired && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 8, padding: '20px 22px', marginBottom: 22, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#a16207', marginBottom: 4 }}>
                    Processing…
                  </div>
                  <div style={{ fontSize: 12, color: '#92400e' }}>
                    Your payment is being confirmed. This page will update automatically.
                  </div>
                </div>
              )}

              {/* Receipt details */}
              {payment && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Receipt Details
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      <Row label="Quote" value={payment.quote_number || '—'} mono />
                      <Row label="Client"  value={payment.client_name || '—'} />
                      <Row label="Email"   value={payment.client_email || '—'} />
                      <Row label="Initial Prepayment" value={fmtCents(payment.face_amount_cents)} mono />
                      {payment.surcharge_amount_cents > 0 && (
                        <Row
                          label={`Card processing fee (${(payment.surcharge_pct * 100).toFixed(1).replace(/\.0$/, '')}%)`}
                          value={fmtCents(payment.surcharge_amount_cents)} mono color="#dc2626"
                        />
                      )}
                      <Row
                        label="Total Charged" mono bold
                        value={fmtCents(payment.total_charged_cents)}
                      />
                      {isPaid && payment.paid_at && (
                        <Row label="Paid On" value={new Date(payment.paid_at).toLocaleString()} />
                      )}
                      {payment.stripe_payment_intent_id && (
                        <Row label="Reference"
                          value={payment.stripe_payment_intent_id}
                          mono small color="#6b7280" />
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
              <div style={{
                marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb',
                fontSize: 11, color: '#6b7280', lineHeight: 1.7, textAlign: 'center',
              }}>
                Questions? Reply to your email confirmation or contact{' '}
                <a href="mailto:billing@ferrumit.com" style={{ color: '#2563eb' }}>billing@ferrumit.com</a>.<br/>
                Payment processed securely by Stripe.
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginTop: 16 }}>
          Ferrum Technology Services, LLC · ferrumit.com
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold, small, color }) {
  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '8px 0', color: '#6b7280', fontSize: small ? 10 : 12 }}>{label}</td>
      <td style={{
        padding: '8px 0', textAlign: 'right',
        fontFamily: mono ? 'DM Mono, monospace' : 'inherit',
        fontSize: small ? 10 : (bold ? 14 : 12),
        fontWeight: bold ? 700 : 400,
        color: color || '#0f1e3c',
        wordBreak: small ? 'break-all' : 'normal',
      }}>{value}</td>
    </tr>
  );
}

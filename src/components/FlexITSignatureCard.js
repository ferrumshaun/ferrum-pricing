// src/components/FlexITSignatureCard.js
// Status card on FlexIT quote pages. Mirrors the visual pattern of
// StripePaymentCard so reps see the deal's signature + payment status side
// by side. States: idle, pending, signed, completed, declined, cancelled.

import React, { useEffect, useState } from 'react';
import {
  getLatestFlexITDoc,
  refreshFlexITDocStatus,
  sendSignatureReminder,
  STATUS_LABELS,
  fmtUsd,
} from '../lib/signatureDocs';
import SendForSignatureModal from './SendForSignatureModal';

export default function FlexITSignatureCard({
  quoteId,
  quoteStatus,           // 'draft' | 'in_review' | 'approved' | etc.
  quoteNumber,
  clientName,
  clientContact,
  clientEmail,
  upfrontAmount,
  userId,
}) {
  const [doc, setDoc]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState('');
  const [showModal, setShow]  = useState(false);

  const isApproved = quoteStatus === 'approved';

  // Initial load
  useEffect(() => {
    if (!quoteId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const d = await getLatestFlexITDoc(quoteId);
      if (cancelled) return;
      setDoc(d);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [quoteId]);

  // Live polling for pending docs (every 15s while not completed/cancelled/declined)
  useEffect(() => {
    if (!doc?.id) return;
    if (['completed', 'cancelled', 'declined', 'expired'].includes(doc.status)) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        await refreshFlexITDocStatus(quoteId, doc.id);
        if (cancelled) return;
        const fresh = await getLatestFlexITDoc(quoteId);
        if (!cancelled) setDoc(fresh);
      } catch { /* swallow polling errors */ }
    }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [doc?.id, doc?.status, quoteId]);

  async function handleManualRefresh() {
    if (!doc?.id) return;
    setBusy(true); setMsg('');
    try {
      await refreshFlexITDocStatus(quoteId, doc.id);
      const fresh = await getLatestFlexITDoc(quoteId);
      setDoc(fresh);
      setMsg('✓ Status refreshed');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg('✗ ' + e.message); }
    setBusy(false);
  }

  async function handleReminder() {
    if (!doc?.id) return;
    setBusy(true); setMsg('');
    try {
      await sendSignatureReminder(doc.id);
      setMsg('✓ Reminder sent to ' + doc.client_email);
      setTimeout(() => setMsg(''), 2500);
    } catch (e) { setMsg('✗ ' + e.message); }
    setBusy(false);
  }

  function handleNewDocument() {
    if (!isApproved) {
      setMsg('Quote must be approved before sending for signature');
      return;
    }
    setShow(true);
  }

  function handleSent(record) {
    setDoc(record);
    setShow(false);
    setMsg(`✓ Sent to ${record.client_email}`);
    setTimeout(() => setMsg(''), 3000);
  }

  // ── Render ──
  if (!quoteId) {
    return (
      <div style={cardWrap('#e5e7eb')}>
        <CardHeader />
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af' }}>
          Save the quote first to enable signature sending.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={cardWrap('#e5e7eb')}>
        <CardHeader />
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af' }}>Loading…</div>
      </div>
    );
  }

  // ── No document yet — initial state ──
  if (!doc) {
    return (
      <div style={cardWrap('#e5e7eb')}>
        <CardHeader />
        <div style={{ padding: '12px' }}>
          {!isApproved ? (
            <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '8px 10px', marginBottom: 8 }}>
              ⚠ Quote must be in <strong>approved</strong> status before sending for signature.
              Current status: <strong>{quoteStatus || 'draft'}</strong>.
              Use Send for Review or self-approve first.
            </div>
          ) : null}
          <button
            onClick={handleNewDocument}
            disabled={!isApproved || busy}
            style={{ ...btnPrimary, width: '100%', padding: '8px 14px', opacity: (!isApproved || busy) ? 0.5 : 1 }}>
            ✏ Send Agreement for Signature
          </button>
          {msg && (
            <div style={{ fontSize: 10, fontWeight: 600, marginTop: 8, color: msg.startsWith('✓') ? '#166534' : '#dc2626' }}>
              {msg}
            </div>
          )}
        </div>

        {showModal && (
          <SendForSignatureModal
            open={showModal}
            onClose={() => setShow(false)}
            onSent={handleSent}
            quoteId={quoteId}
            quoteNumber={quoteNumber}
            clientName={clientName}
            clientContact={clientContact}
            clientEmail={clientEmail}
            upfrontAmount={upfrontAmount}
            userId={userId}
          />
        )}
      </div>
    );
  }

  // ── Have a document — render based on status ──
  const status = doc.status;
  const isPending    = ['sent', 'viewed', 'signed'].includes(status);
  const isCompleted  = status === 'completed';
  const isDeclined   = status === 'declined';
  const isCancelled  = status === 'cancelled';
  const isExpired    = status === 'expired';
  const failed       = isDeclined || isCancelled || isExpired;

  const borderColor =
    isCompleted ? '#bbf7d0' :
    isPending   ? '#fde68a' :
    failed      ? '#fecaca' : '#e5e7eb';

  return (
    <>
      <div style={cardWrap(borderColor)}>
        <CardHeader signed={isCompleted} pending={isPending} failed={failed} testMode={doc.test_mode} />

        {/* Status row */}
        <div style={{ padding: '10px 12px', background: isCompleted ? '#f0fdf4' : isPending ? '#fffbeb' : failed ? '#fef2f2' : '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: isCompleted ? '#166534' : isPending ? '#a16207' : '#991b1b', marginBottom: 4 }}>
            {STATUS_LABELS[status] || status}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.6 }}>
            <div>Sent to: <strong>{doc.client_email}</strong></div>
            {doc.created_at && <div>On {new Date(doc.created_at).toLocaleString()}</div>}
            {doc.signed_at && <div style={{ color: '#166534', fontWeight: 600 }}>Client signed {new Date(doc.signed_at).toLocaleString()}</div>}
            {doc.completed_at && <div style={{ color: '#166534', fontWeight: 600 }}>All signatures complete {new Date(doc.completed_at).toLocaleString()}</div>}
            {doc.countersign_required && (
              <div>Countersign: {doc.countersigned ? '✓ Done' : '○ Pending'}</div>
            )}
            {doc.upfront_amount && <div>Amount: {fmtUsd(doc.upfront_amount)}</div>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {isPending && (
              <>
                <button onClick={handleReminder} disabled={busy} style={btnSecondary}>
                  📧 Send Reminder
                </button>
                <button onClick={handleManualRefresh} disabled={busy} style={btnSecondary}>
                  ↻ Refresh
                </button>
              </>
            )}
            {isCompleted && doc.completed_pdf_url && (
              <a href={doc.completed_pdf_url} target="_blank" rel="noopener noreferrer" style={btnLink}>
                📄 Download Signed PDF ↗
              </a>
            )}
            {failed && (
              <button onClick={handleNewDocument} disabled={busy || !isApproved} style={btnPrimary}>
                Send New Agreement
              </button>
            )}
            {(isCompleted || isPending) && isApproved && (
              <button onClick={handleNewDocument} disabled={busy} style={{ ...btnSecondary, marginLeft: 'auto' }}>
                + Send Another
              </button>
            )}
          </div>

          {msg && (
            <div style={{ fontSize: 10, fontWeight: 600, marginTop: 8, color: msg.startsWith('✓') ? '#166534' : '#dc2626' }}>
              {msg}
            </div>
          )}

          {/* v3.5.18 placeholder — show what'll happen on completion */}
          {!isCompleted && !failed && (
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 8, fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: 6 }}>
              Note: Auto-payment trigger after signing will be wired up in v3.5.18.
              For now, payment link must be sent manually from the Stripe Prepayment card after signing.
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <SendForSignatureModal
          open={showModal}
          onClose={() => setShow(false)}
          onSent={handleSent}
          quoteId={quoteId}
          quoteNumber={quoteNumber}
          clientName={clientName}
          clientContact={clientContact}
          clientEmail={clientEmail}
          upfrontAmount={upfrontAmount}
          userId={userId}
        />
      )}
    </>
  );
}

function CardHeader({ signed, pending, failed, testMode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', background: '#0f1e3c', borderRadius: '6px 6px 0 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, background: '#0ea5e9', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: 'white',
        }}>SW</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>SignWell — Agreement</div>
          <div style={{ fontSize: 8, color: '#9ca3af' }}>FlexIT order + acceptance terms + signatures</div>
        </div>
      </div>
      {testMode && <span style={{ fontSize: 9, fontWeight: 700, color: '#a16207', background: '#fef3c7', padding: '2px 7px', borderRadius: 3 }}>TEST</span>}
      {signed   && <span style={{ fontSize: 9, fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '2px 7px', borderRadius: 3 }}>SIGNED ✓</span>}
      {pending  && !signed && <span style={{ fontSize: 9, fontWeight: 700, color: '#a16207', background: '#fef3c7', padding: '2px 7px', borderRadius: 3 }}>PENDING</span>}
      {failed   && <span style={{ fontSize: 9, fontWeight: 700, color: '#991b1b', background: '#fee2e2', padding: '2px 7px', borderRadius: 3 }}>!</span>}
    </div>
  );
}

const cardWrap = (border) => ({
  background: 'white', border: `1px solid ${border}`, borderRadius: 6,
  marginBottom: 10, overflow: 'hidden',
});
const btnPrimary = {
  padding: '6px 12px', background: '#0ea5e9', color: 'white', border: 'none',
  borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary = {
  padding: '6px 12px', background: 'white', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const btnLink = {
  padding: '6px 12px', background: 'transparent', color: '#2563eb',
  border: '1px solid #bfdbfe', borderRadius: 4, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
};

// src/components/SendForSignatureModal.js
// Reusable Send for Signature modal.
// Shows: recipient inputs, countersign toggle (with rule-based default),
// inline HTML preview, "Print to PDF" action, and Send button.
//
// Built modular so v3.5.18+ can pass different builders for IT/Bundle/Voice/MultiSite.

import React, { useEffect, useMemo, useState } from 'react';
import {
  buildFlexITSignatureDoc,
  sendFlexITForSignature,
  getCountersignThreshold,
  getCompanySignerDefaults,
  fmtUsd,
} from '../lib/signatureDocs';

export default function SendForSignatureModal({
  open,
  onClose,
  onSent,
  // Quote context
  quoteId,
  quoteNumber,
  clientName,            // business name
  clientContact,         // person name
  clientEmail,           // pre-fill recipient email
  upfrontAmount,         // used to determine default countersign on/off
  testModeDefault = false,
  userId,
}) {
  const [recipientName,  setRecipientName]  = useState(clientContact || clientName || '');
  const [recipientEmail, setRecipientEmail] = useState(clientEmail || '');
  const [customMsg,      setCustomMsg]      = useState('');
  const [countersign,    setCountersign]    = useState(false);
  const [countersignReason, setCountersignReason] = useState('');
  const [companySigner,  setCompanySigner]  = useState({ name: '', title: '', email: '' });
  const [testMode,       setTestMode]       = useState(testModeDefault);

  const [loading,        setLoading]        = useState(true);
  const [previewing,     setPreviewing]     = useState(true);
  const [previewHtml,    setPreviewHtml]    = useState('');
  const [previewError,   setPreviewError]   = useState('');
  const [sending,        setSending]        = useState(false);
  const [sendError,      setSendError]      = useState('');

  // Initial load: read threshold, company signer defaults, set countersign default
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [threshold, signer] = await Promise.all([
          getCountersignThreshold(),
          getCompanySignerDefaults(),
        ]);
        if (cancelled) return;
        setCompanySigner(signer);
        const aboveThreshold = (upfrontAmount || 0) >= threshold;
        setCountersign(aboveThreshold);
        setCountersignReason(aboveThreshold
          ? `Default ON because ${fmtUsd(upfrontAmount)} ≥ ${fmtUsd(threshold)} threshold`
          : `Default OFF because ${fmtUsd(upfrontAmount)} < ${fmtUsd(threshold)} threshold`);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setSendError('Failed to load defaults: ' + e.message);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, upfrontAmount]);

  // Build preview whenever the countersign toggle changes
  useEffect(() => {
    if (!open || loading) return;
    let cancelled = false;
    setPreviewing(true); setPreviewError('');
    (async () => {
      try {
        const doc = await buildFlexITSignatureDoc({
          quoteId,
          countersignRequired: countersign,
        });
        if (cancelled) return;
        setPreviewHtml(doc.html);
        setPreviewing(false);
      } catch (e) {
        if (cancelled) return;
        setPreviewError(e.message);
        setPreviewing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, loading, quoteId, countersign]);

  // Validation
  const canSend = useMemo(() => {
    if (sending || loading || previewing) return false;
    if (!recipientName.trim() || !recipientEmail.trim()) return false;
    if (countersign && !companySigner.email) return false;  // need company signer email if counter-signing
    return true;
  }, [sending, loading, previewing, recipientName, recipientEmail, countersign, companySigner]);

  async function handleSend() {
    setSending(true); setSendError('');
    try {
      const record = await sendFlexITForSignature({
        quoteId,
        clientName,
        clientContact: recipientName,
        clientEmail:   recipientEmail,
        countersignRequired: countersign,
        companySignerName:   companySigner.name,
        companySignerEmail:  companySigner.email,
        testMode,
        customMessage: customMsg,
        userId,
      });
      onSent?.(record);
      onClose?.();
    } catch (e) {
      setSendError(e.message);
    }
    setSending(false);
  }

  // Print preview to PDF — opens a new tab with the HTML, lets user print to PDF.
  // Faster than spinning up a Puppeteer function and matches what SignWell will produce.
  function handleDownloadPdf() {
    if (!previewHtml) return;
    const w = window.open('', '_blank');
    if (!w) { setSendError('Popup blocked — allow popups to use the PDF preview'); return; }
    w.document.write(previewHtml);
    w.document.close();
    // Give the browser a beat to render before triggering print
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 500);
  }

  if (!open) return null;

  return (
    <div style={overlay}>
      <div style={modalShell}>
        {/* Header */}
        <div style={headerWrap}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f1e3c' }}>
              Send FlexIT Agreement for Signature
            </h3>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {quoteNumber || 'DRAFT'} · {clientName || '—'} · Total: {fmtUsd(upfrontAmount)}
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        {/* Body — 2 column: form left, preview right */}
        <div style={bodyWrap}>
          {/* Left: form */}
          <div style={leftCol}>
            <Field label="Recipient Name">
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
                placeholder="Contact person at the client"
                style={inputStyle} />
            </Field>

            <Field label="Recipient Email">
              <input value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                type="email" placeholder="client@example.com"
                style={inputStyle} />
            </Field>

            <Field label="Custom Message (optional)">
              <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)}
                rows={3} placeholder="Per our call today, please review and sign…"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            {/* Countersign block */}
            <div style={{ background: countersign ? '#eef2ff' : '#f8fafc', border: `1px solid ${countersign ? '#a5b4fc' : '#e5e7eb'}`, borderRadius: 5, padding: 10, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={countersign} onChange={e => setCountersign(e.target.checked)}
                  style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1e3c' }}>
                    Require company countersignature
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                    {countersignReason}
                  </div>
                </div>
              </label>

              {countersign && (
                <div style={{ marginTop: 10, paddingLeft: 26 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
                    Company signer: <strong>{companySigner.name || '—'}</strong>
                    {companySigner.title ? ` · ${companySigner.title}` : ''}
                  </div>
                  {!companySigner.email && (
                    <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
                      ⚠ Company signer email not set. Configure it in Admin → Documents before sending with countersign.
                    </div>
                  )}
                  {companySigner.email && (
                    <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'DM Mono, monospace' }}>
                      {companySigner.email}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Test mode */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
              <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
              <span><strong>Test mode</strong> — SignWell will mark this as a test, no real signature collected</span>
            </label>

            {sendError && (
              <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#991b1b', fontSize: 11, marginBottom: 10, fontFamily: 'DM Mono, monospace', wordBreak: 'break-word' }}>
                {sendError}
              </div>
            )}
          </div>

          {/* Right: preview */}
          <div style={rightCol}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f1f5f9', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Document Preview
              </span>
              <button onClick={handleDownloadPdf} disabled={previewing || !previewHtml}
                style={{ padding: '4px 10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 10, fontWeight: 600, color: '#475569', cursor: 'pointer', opacity: previewing ? 0.5 : 1 }}>
                📄 Print to PDF
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: 'white' }}>
              {loading || previewing ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
                  Building preview…
                </div>
              ) : previewError ? (
                <div style={{ padding: 20, color: '#dc2626', fontSize: 11 }}>
                  ✗ {previewError}
                </div>
              ) : (
                <iframe
                  title="signature-preview"
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={footerWrap}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button onClick={handleSend} disabled={!canSend} style={{ ...sendBtn, opacity: canSend ? 1 : 0.5 }}>
            {sending ? 'Sending…' : `Send for Signature${countersign ? ' (with countersign)' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// Styles
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
};
const modalShell = {
  background: 'white', borderRadius: 8, width: '90%', maxWidth: 1100, height: '85vh',
  display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
};
const headerWrap = {
  padding: '14px 18px', borderBottom: '1px solid #e5e7eb',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
};
const closeBtn = {
  background: 'none', border: 'none', fontSize: 24, color: '#9ca3af', cursor: 'pointer', padding: 0, lineHeight: 1,
};
const bodyWrap = {
  flex: 1, display: 'flex', overflow: 'hidden',
};
const leftCol = {
  width: 360, padding: 16, borderRight: '1px solid #e5e7eb', overflow: 'auto', flexShrink: 0,
};
const rightCol = {
  flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const inputStyle = {
  width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none', boxSizing: 'border-box',
};
const footerWrap = {
  padding: '12px 18px', borderTop: '1px solid #e5e7eb',
  display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
};
const cancelBtn = {
  padding: '7px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, color: '#374151', cursor: 'pointer',
};
const sendBtn = {
  padding: '7px 18px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

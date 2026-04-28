// src/lib/signatureDocs.js
// Client wrapper for the signature flow. Coordinates between:
//   - /.netlify/functions/buildSignatureDocument  (assembles HTML+base64)
//   - /.netlify/functions/signwellProxy           (creates SignWell document)
//   - quotes.inputs.signwellDocuments JSONB array (tracks state)
//
// Mirrors the existing LOA / IntlDialingWaiver pattern (see LOAModal.js,
// IntlDialingWaiver.js) so the data shape is consistent across all signature
// document types.

import { supabase } from './supabase';

// ── Build the document HTML/base64 (no SignWell call yet) ─────────────────────
// Used for the preview modal. Returns { html, base64, name, subject, summary }.
export async function buildFlexITSignatureDoc({ quoteId, countersignRequired }) {
  if (!quoteId) throw new Error('quoteId required');
  const res = await fetch('/.netlify/functions/buildSignatureDocument', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ quoteId, countersignRequired }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Build failed: HTTP ${res.status}`);
  return data;
}

// ── Send to SignWell + record in quotes.inputs.signwellDocuments ──────────────
export async function sendFlexITForSignature({
  quoteId,
  clientName,
  clientEmail,
  clientContact,           // contact person (display name on signer)
  countersignRequired,
  companySignerName,
  companySignerEmail,
  testMode = false,
  customMessage,
  userId,                  // who's sending (for audit)
}) {
  if (!quoteId)     throw new Error('quoteId required');
  if (!clientEmail) throw new Error('clientEmail required');

  // 1. Build the document HTML server-side (uses current quote + current legal HTML)
  const doc = await buildFlexITSignatureDoc({ quoteId, countersignRequired });

  // 2. Build the recipients array.
  // signer1 is ALWAYS the client. signer2 is company countersigner (if needed).
  const recipients = [
    {
      id:    '1',
      name:  clientContact || clientName,
      email: clientEmail,
    },
  ];
  if (countersignRequired && companySignerEmail) {
    recipients.push({
      id:    '2',
      name:  companySignerName || 'Ferrum Technology Services',
      email: companySignerEmail,
    });
  }

  // 3. Create the SignWell document via the existing proxy
  const message = (customMessage && customMessage.trim())
    ? customMessage
    : `Please review and sign the attached FlexIT agreement for your Ferrum Technology Services account. The agreement includes the order summary, full terms and conditions, and signature block. After signing, you will receive a separate email with payment instructions.`;

  const swRes = await fetch('/.netlify/functions/signwellProxy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'createDocumentFromTemplate',
      payload: {
        test_mode: testMode,
        name:      doc.name,
        subject:   doc.subject,
        message,
        files: [{
          name:        `FlexIT_Agreement_${doc.summary.quoteNumber || 'DRAFT'}.html`,
          file_base64: doc.base64,
        }],
        recipients,
      },
    }),
  });

  const swData = await swRes.json();
  if (!swRes.ok) {
    const errMsg = swData?.error || swData?.errors?.[0]?.message || swData?.message || `SignWell HTTP ${swRes.status}`;
    throw new Error(errMsg);
  }

  // 4. Record in quotes.inputs.signwellDocuments (matches existing LOA/IntlWaiver pattern)
  const record = {
    id:                   swData.id,
    type:                 'flexit_quote',
    status:               swData.status || 'sent',
    created_at:           new Date().toISOString(),
    created_by:           userId || null,
    client_email:         clientEmail,
    client_name:          clientContact || clientName,
    countersign_required: !!countersignRequired,
    countersigned:        false,
    signed_at:            null,
    completed_at:         null,
    completed_pdf_url:    null,
    legal_terms_version:  doc.legalTermsHash,
    upfront_amount:       doc.summary.upfrontAmount,
    payment_id:           null,    // v3.5.18 will populate
    test_mode:            testMode,
  };

  const { data: current } = await supabase
    .from('quotes')
    .select('inputs')
    .eq('id', quoteId)
    .single();
  const existing = current?.inputs?.signwellDocuments || [];
  // De-dupe by id in case of accidental retry
  const filtered = existing.filter(d => d.id !== record.id);
  const updated  = [...filtered, record];
  await supabase
    .from('quotes')
    .update({ inputs: { ...(current?.inputs || {}), signwellDocuments: updated } })
    .eq('id', quoteId);

  return record;
}

// ── Get latest FlexIT signature doc for a quote ───────────────────────────────
// Reads from quotes.inputs.signwellDocuments — same source the LOA/IntlWaiver UI
// reads from, so state is always consistent.
export async function getLatestFlexITDoc(quoteId) {
  if (!quoteId) return null;
  const { data, error } = await supabase
    .from('quotes')
    .select('inputs')
    .eq('id', quoteId)
    .single();
  if (error) return null;
  const docs = (data?.inputs?.signwellDocuments || []).filter(d => d.type === 'flexit_quote');
  if (docs.length === 0) return null;
  // Return most recent (in case the rep cancelled and re-sent)
  return docs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
}

// ── Refresh status from SignWell + persist back to inputs ────────────────────
export async function refreshFlexITDocStatus(quoteId, documentId) {
  if (!documentId) throw new Error('documentId required');

  const res = await fetch('/.netlify/functions/signwellProxy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'getDocument', payload: { documentId } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `SignWell HTTP ${res.status}`);

  // Map SignWell statuses to our internal vocabulary
  const swStatus = data.status; // 'sent' | 'viewed' | 'signed' | 'completed' | 'declined' | 'cancelled' | 'expired'
  const recipients = data.recipients || [];

  // Client is signer id=1. Company is id=2 (when present).
  const clientRec   = recipients.find(r => String(r.id) === '1');
  const companyRec  = recipients.find(r => String(r.id) === '2');

  const clientSigned   = clientRec?.status === 'signed' || clientRec?.signed_at != null;
  const companySigned  = companyRec ? (companyRec.status === 'signed' || companyRec.signed_at != null) : null;
  const completed      = swStatus === 'completed';

  // Persist updated state
  if (quoteId) {
    const { data: cur } = await supabase
      .from('quotes')
      .select('inputs')
      .eq('id', quoteId)
      .single();
    const docs = cur?.inputs?.signwellDocuments || [];
    const idx  = docs.findIndex(d => d.id === documentId);
    if (idx >= 0) {
      const updated = [...docs];
      updated[idx] = {
        ...updated[idx],
        status:            swStatus,
        signed_at:         updated[idx].signed_at || (clientSigned ? (clientRec?.signed_at || new Date().toISOString()) : null),
        countersigned:     companySigned === true ? true : !!updated[idx].countersigned,
        completed_at:      updated[idx].completed_at || (completed ? new Date().toISOString() : null),
        completed_pdf_url: data.completed_pdf_url || updated[idx].completed_pdf_url || null,
      };
      await supabase
        .from('quotes')
        .update({ inputs: { ...(cur?.inputs || {}), signwellDocuments: updated } })
        .eq('id', quoteId);
    }
  }

  return {
    status:        swStatus,
    clientSigned,
    companySigned,
    completed,
    completedPdfUrl: data.completed_pdf_url || null,
    recipients: recipients.map(r => ({
      id:       String(r.id),
      name:     r.name,
      email:    r.email,
      signed:   r.status === 'signed' || r.signed_at != null,
      signedAt: r.signed_at || null,
    })),
  };
}

// ── Send a SignWell reminder (for pending docs) ──────────────────────────────
export async function sendSignatureReminder(documentId) {
  if (!documentId) throw new Error('documentId required');
  const res = await fetch('/.netlify/functions/signwellProxy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'sendReminder', payload: { documentId } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Reminder failed: HTTP ${res.status}`);
  return data;
}

// ── Should countersign default ON for this amount? ───────────────────────────
export async function getCountersignThreshold() {
  const { data } = await supabase
    .from('pricing_settings')
    .select('value')
    .eq('key', 'legal_countersign_threshold')
    .single();
  return parseFloat(data?.value || '5000');
}

// ── Read the company default signer (name/title/email) from settings ─────────
export async function getCompanySignerDefaults() {
  const rows = await supabase
    .from('pricing_settings')
    .select('key,value')
    .in('key', [
      'legal_default_company_signer_name',
      'legal_default_company_signer_title',
      'legal_default_company_signer_email',
    ]);
  const map = {};
  (rows.data || []).forEach(r => { map[r.key] = r.value; });
  return {
    name:  map.legal_default_company_signer_name  || '',
    title: map.legal_default_company_signer_title || '',
    email: map.legal_default_company_signer_email || '',
  };
}

// Format helpers
export const fmtUsd = n => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export const STATUS_LABELS = {
  sent:      'Awaiting client signature',
  viewed:    'Client opened the document',
  signed:    'Client signed — awaiting countersign',
  completed: 'All parties signed',
  declined:  'Client declined to sign',
  cancelled: 'Cancelled',
  expired:   'Expired',
};

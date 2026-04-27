// signwell.js — SignWell e-signature integration

async function swCall(action, payload) {
  const res = await fetch('/.netlify/functions/signwellProxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok) {
    // Dump the full raw error so we can see exactly what SignWell is rejecting
    const raw = JSON.stringify(data);
    throw new Error(raw || `SignWell HTTP ${res.status}`);
  }
  return data;
}

// ── Send the International Dialing Waiver for signature ───────────────────────
export async function sendIntlDialingWaiver({
  clientName,
  clientEmail,
  contactName,
  entityName,
  title,
  tier,
  tierLabel,
  tierDesc,
  quoteNumber,
  templateId,
  testMode = false,
}) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Build waiver content as HTML (page 1)
  const waiverHtml    = buildWaiverHtml({ contactName, entityName, title, tier, tierLabel, tierDesc, today, quoteNumber });
  const base64Content = btoa(unescape(encodeURIComponent(waiverHtml)));

  // with_signature_page: true tells SignWell to append its own signature page
  // automatically — no template, no field coordinates needed
  const result = await swCall('createDocumentFromTemplate', {
    test_mode:  testMode,
    name:       `International Dialing Authorization — ${entityName}${quoteNumber ? ` (${quoteNumber})` : ''}`,
    subject:    `Action Required — International Dialing Authorization · ${entityName}`,
    message:    `Please review and sign the International Dialing Authorization for your Ferrum Technology Services account. This document enables ${tierLabel} on your hosted SIP trunk. By signing, you acknowledge and accept full financial responsibility for all international calling charges.`,
    files: [{
      name:        'International_Dialing_Authorization.html',
      file_base64: base64Content,
    }],
    recipients: [{ id: '1', name: contactName || clientName, email: clientEmail }],
  });

  return {
    documentId: result.id,
    status:     result.status || 'pending',
    createdAt:  new Date().toISOString(),
    clientEmail,
    clientName: contactName || clientName,
    entityName,
    tier,
    tierLabel,
    quoteNumber,
  };
}

// ── Get document status ───────────────────────────────────────────────────────
export async function getSignwellDocStatus(documentId) {
  const data = await swCall('getDocument', { documentId });
  return {
    status: data.status,
    completedPdfUrl: data.completed_pdf_url || null,
    recipients: (data.recipients || []).map(r => ({
      name:   r.name,
      email:  r.email,
      signed: r.status === 'signed' || r.signed_at != null,
      signedAt: r.signed_at || null,
    })),
  };
}

// ── Send reminder ─────────────────────────────────────────────────────────────
export async function sendReminder(documentId) {
  return swCall('sendReminder', { documentId });
}

// ── Build waiver text document ────────────────────────────────────────────────
// Uses SignWell text tags for field placement: [[s|1]] = signer 1, [[sig|1]] = signature
export function buildWaiverText({ contactName, entityName, title, tier, tierLabel, tierDesc, today, quoteNumber }) {
  // Keep for backwards compat
  return buildWaiverHtml({ contactName, entityName, title, tier, tierLabel, tierDesc, today, quoteNumber });
}

function buildWaiverHtml({ contactName, entityName, title, tier, tierLabel, tierDesc, today, quoteNumber }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Georgia, serif; font-size: 12px; line-height: 1.8; max-width: 720px; margin: 40px auto; padding: 0 30px; color: #1f2937; }
  h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 11px; color: #6b7280; margin-bottom: 28px; }
  h2 { font-size: 13px; margin-top: 22px; margin-bottom: 6px; }
  p { margin: 0 0 14px; }
  .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin: 14px 0; font-weight: bold; }
</style>
</head>
<body>

<h1>International Dialing Authorization &amp; Liability Waiver</h1>
<div class="subtitle">
  Ferrum Technology Services, LLC${quoteNumber ? ` &nbsp;·&nbsp; ${quoteNumber}` : ''} &nbsp;·&nbsp; ${today}
</div>

<p>This International Dialing Authorization (&ldquo;Authorization&rdquo;) is entered into as of <strong>${today}</strong>, by and between <strong>Ferrum Technology Services, LLC</strong> (&ldquo;Provider&rdquo;) and <strong>${entityName || '[Client Name]'}</strong> (&ldquo;Client&rdquo;).</p>

<h2>1. Request for International Calling</h2>
<p>Client hereby requests that Provider enable <strong>${tierLabel}</strong> (${tierDesc}) on Client&rsquo;s hosted SIP trunking service. Client acknowledges that enabling international calling inherently introduces risk of unauthorized use and toll fraud.</p>

<h2>2. Client Assumes All Financial Responsibility</h2>
<p>Client acknowledges and agrees that it assumes <em>full and sole financial responsibility</em> for all charges associated with international calling placed through Client&rsquo;s account, whether authorized or unauthorized. This includes, without limitation, charges resulting from toll fraud, unauthorized access, compromised credentials, PBX hacking, or any other security incident that results in international calls being placed through Client&rsquo;s SIP trunk or hosted telephony environment.</p>

<div class="warning">THERE IS NO CAP ON CHARGES UNDER THIS AUTHORIZATION.</div>

<h2>3. No Cap on Charges</h2>
<p>Client acknowledges that international calling charges are metered and billed as incurred. Provider shall not be liable for any charges, losses, or damages &mdash; including consequential, incidental, or punitive damages &mdash; arising from international calling activity on Client&rsquo;s account.</p>

<h2>4. Security Responsibility</h2>
<p>Client is solely responsible for the security of its telephony environment, including but not limited to extension passwords, SIP credentials, call routing rules, and network access controls. Provider recommends Client implement call limits, country restrictions, and off-hours lockouts where available.</p>

<h2>5. Right to Suspend</h2>
<p>Provider reserves the right to disable international calling immediately and without notice in the event of suspected fraud, unusual call patterns, or non-payment of charges.</p>

<h2>6. Indemnification</h2>
<p>Client agrees to indemnify, defend, and hold harmless Ferrum Technology Services, LLC and its officers, employees, and agents from and against any and all claims, liabilities, damages, costs, and expenses (including reasonable attorneys&rsquo; fees) arising from or related to international calling activity on Client&rsquo;s account.</p>

<hr style="margin:32px 0; border:none; border-top:1px solid #e5e7eb;"/>

<table style="width:100%; border-collapse:collapse; margin-top:8px;">
  <tr>
    <td style="width:48%; vertical-align:top; padding-right:4%;">
      <div style="font-size:11px; font-weight:bold; margin-bottom:14px;">Client</div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:3px;">Full Legal Name</div>
        <div style="font-size:11px; border-bottom:1px solid #374151; padding-bottom:4px; min-height:18px;">${contactName || ''}<span style="color:white;font-size:1px;">{{autofill_name}}</span></div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:3px;">Company Name</div>
        <div style="font-size:11px; border-bottom:1px solid #374151; padding-bottom:4px; min-height:18px;">${entityName || ''}<span style="color:white;font-size:1px;">{{autofill_company}}</span></div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:3px;">Title / Role</div>
        <div style="font-size:11px; border-bottom:1px solid #374151; padding-bottom:4px; min-height:18px;">${title || ''}<span style="color:white;font-size:1px;">{{autofill_title}}</span></div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:3px;">Signature</div>
        <div style="min-height:48px; border-bottom:1px solid #374151;"><span style="color:white;font-size:1px;">{{signature}}</span></div>
      </div>

      <div>
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:3px;">Date</div>
        <div style="font-size:11px; border-bottom:1px solid #374151; padding-bottom:4px; min-height:18px;"><span style="color:white;font-size:1px;">{{date}}</span></div>
      </div>
    </td>
  </tr>
</table>

<p style="margin-top:28px; font-size:9px; color:#6b7280; text-align:center;">
  Electronic signatures are legally binding pursuant to E-SIGN and UETA. &nbsp;·&nbsp; Ferrum Technology Services, LLC &nbsp;·&nbsp; ferrumit.com
</p>

</body>
</html>`;
}

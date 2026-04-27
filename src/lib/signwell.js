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
  proposalName,
  scope,
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
  Ferrum Technology Services, LLC &nbsp;·&nbsp; ${today}
</div>

${(proposalName || quoteNumber || scope) ? `
<table style="width:100%; border-collapse:collapse; margin:0 0 24px 0; background:#f8fafc; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
  <thead>
    <tr style="background:#0f1e3c;">
      <td colspan="2" style="padding:8px 14px; font-size:11px; font-weight:bold; color:white; letter-spacing:0.04em;">
        DOCUMENT REFERENCE
      </td>
    </tr>
  </thead>
  <tbody>
    ${proposalName ? `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 14px; font-size:9px; font-weight:bold; color:#6b7280; text-transform:uppercase; width:30%;">Proposal</td>
      <td style="padding:7px 14px; font-size:11px; color:#0f1e3c;">${proposalName}</td>
    </tr>` : ''}
    ${quoteNumber ? `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 14px; font-size:9px; font-weight:bold; color:#6b7280; text-transform:uppercase;">Reference #</td>
      <td style="padding:7px 14px; font-size:11px; font-family:monospace; color:#0f1e3c;">${quoteNumber}</td>
    </tr>` : ''}
    ${scope ? `<tr>
      <td style="padding:7px 14px; font-size:9px; font-weight:bold; color:#6b7280; text-transform:uppercase;">Authorized Scope</td>
      <td style="padding:7px 14px; font-size:11px; color:#0f1e3c;">${scope}</td>
    </tr>` : ''}
  </tbody>
</table>` : ''}

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

      <div style="margin-bottom:14px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Full Legal Name</div>
        <div style="border-bottom:1px solid #374151; min-height:28px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:550px; height:26px; font-size:18px;">&nbsp;{{text}}</span>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Company Name</div>
        <div style="border-bottom:1px solid #374151; min-height:28px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:550px; height:26px; font-size:18px;">&nbsp;{{text:1}}</span>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Title / Role</div>
        <div style="border-bottom:1px solid #374151; min-height:28px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:550px; height:26px; font-size:18px;">&nbsp;{{text:1}}</span>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Signature</div>
        <div style="border-bottom:1px solid #374151; min-height:84px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:550px; height:80px; font-size:18px;">&nbsp;{{signature}}</span>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Date</div>
        <div style="font-size:12px; color:#374151; border-bottom:1px solid #374151; padding:4px 0 6px 0;">
          ${today}
        </div>
        <div style="font-size:8px; color:#9ca3af; margin-top:3px;">Exact signing date and time recorded in audit trail</div>
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

// ── Send Letter of Authorization for number porting ──────────────────────────
export async function sendLOA({
  clientEmail, contactName, entityName, title,
  quoteNumber, proposalName,
  carrierName, carrierAcctNum, carrierAcctName, acctType, wirelessPin,
  svcStreet, svcCity, svcState, svcZip,
  didList,
  templateId,
  testMode = false,
}) {
  const today  = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const dids   = didList.split('\n').filter(l => l.trim());
  const loaHtml = buildLOAHtml({ contactName, entityName, title, quoteNumber, proposalName, carrierName, carrierAcctNum, carrierAcctName, acctType, wirelessPin, svcStreet, svcCity, svcState, svcZip, dids, today });
  const base64Content = btoa(unescape(encodeURIComponent(loaHtml)));

  const result = await swCall('createDocumentFromTemplate', {
    templateId,
    test_mode:  testMode,
    name:       `Letter of Authorization — ${entityName}${quoteNumber ? ` (${quoteNumber})` : ''}`,
    subject:    `Action Required — Number Porting Authorization · ${entityName}`,
    message:    `Please review and sign the Letter of Authorization to authorize Ferrum Technology Services, LLC to port your phone number(s) from your current carrier. This document is required before we can submit the port request on your behalf.`,
    files: [{
      name:        'Letter_of_Authorization.html',
      file_base64: base64Content,
    }],
    recipients: [{ id: '1', name: contactName || entityName, email: clientEmail }],
  });

  return {
    documentId:  result.id,
    status:      result.status || 'pending',
    createdAt:   new Date().toISOString(),
    clientEmail,
    clientName:  contactName || entityName,
    entityName,
    carrierName,
    quoteNumber,
    type:        'loa',
  };
}

function buildLOAHtml({ contactName, entityName, title, quoteNumber, proposalName, carrierName, carrierAcctNum, carrierAcctName, acctType, wirelessPin, svcStreet, svcCity, svcState, svcZip, dids, today }) {
  const acctTypeLabel = acctType ? acctType.charAt(0).toUpperCase() + acctType.slice(1) : '';
  const numList = dids.map(n => `<tr><td style="padding:3px 8px; font-family:monospace; border-bottom:1px solid #f1f5f9;">${n}</td></tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Georgia, serif; font-size: 12px; line-height: 1.8; max-width: 720px; margin: 40px auto; padding: 0 30px; color: #1f2937; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 2px; }
  h2 { font-size: 13px; text-align: center; color: #374151; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 10px; color: #6b7280; margin-bottom: 24px; }
  p { margin: 0 0 14px; }
  .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 8px 12px; margin: 14px 0; font-size: 11px; font-weight: bold; }
  table.info { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 11px; }
  table.info td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  table.info td:first-child { font-weight: 600; color: #6b7280; width: 40%; }
  table.dids { width: 60%; border-collapse: collapse; margin: 8px 0 16px 0; font-size: 11px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
</style>
</head>
<body>

<h1>Letter of Authorization</h1>
<h2>Local Number Porting &mdash; Hosted PBX Services</h2>
<div class="subtitle">
  Ferrum Technology Services, LLC${quoteNumber ? ` &nbsp;&middot;&nbsp; ${quoteNumber}` : ''} &nbsp;&middot;&nbsp; ${today}
  ${proposalName ? `<br/>${proposalName}` : ''}
</div>

<p>By signing this letter, you authorize <strong>Ferrum Technology Services, LLC</strong> to communicate with your current telephone provider in an effort to port your number(s) to our hosted PBX service. There will be a one-time fee per number ported for this service.</p>

<p>Please verify that all information below <strong>EXACTLY matches your current telephone bill</strong>, or contact your current service provider if necessary.</p>

<table class="info">
  <tr><td>Current Carrier / Provider</td><td>${carrierName || ''}</td></tr>
  <tr><td>Account Number</td><td>${carrierAcctNum || ''}</td></tr>
  <tr><td>Account Billing Name</td><td>${carrierAcctName || ''}</td></tr>
  <tr><td>Account Type</td><td>${acctTypeLabel}</td></tr>
  ${wirelessPin ? `<tr><td>Wireless PIN / Tax ID / Last 4 SSN</td><td>${wirelessPin}</td></tr>` : ''}
</table>

<p><strong>Service Address</strong> &mdash; Must reflect the SERVICE address on record with your current telephone provider. Cannot be a PO Box.</p>

<table class="info">
  <tr><td>Street</td><td>${svcStreet || ''}</td></tr>
  <tr><td>City</td><td>${svcCity || ''}</td></tr>
  <tr><td>State</td><td>${svcState || ''}</td></tr>
  <tr><td>Zip</td><td>${svcZip || ''}</td></tr>
</table>

<p><strong>Numbers to be Ported</strong> (10 digits each &mdash; ${dids.length} number${dids.length !== 1 ? 's' : ''}):</p>
<table class="dids">
  ${numList || '<tr><td style="color:#9ca3af; font-style:italic;">No numbers listed</td></tr>'}
</table>

<div class="warning">
  IMPORTANT: A separate Letter of Authorization is required for each account if you are porting numbers from multiple accounts or different carriers.
</div>

<p>By signing below, I confirm that all information provided is accurate and that I have verified with my current provider that <strong>NO NUMBER LISTED ABOVE HAS DSL OR ALARM SYSTEMS ASSOCIATED WITH IT.</strong> I understand that:</p>

<ul style="font-size:11px; line-height:1.9;">
  <li>I must NOT contact my current provider to disconnect service until the port is complete.</li>
  <li>I must NOT make any account changes with my current provider during the porting process.</li>
  <li>My account balance with my current provider must be paid in full.</li>
  <li>It is my responsibility to disconnect service with the old provider AFTER the port is completed.</li>
</ul>

<hr/>

<table style="width:100%; border-collapse:collapse; margin-top:8px;">
  <tr>
    <td style="width:52%; vertical-align:top; padding-right:6%;">
      <div style="font-size:11px; font-weight:bold; margin-bottom:14px;">Authorized Signature</div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Full Legal Name</div>
        <div style="border-bottom:1px solid #374151; min-height:24px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:400px; height:22px; font-size:16px;">&nbsp;{{text}}</span>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Company Name</div>
        <div style="border-bottom:1px solid #374151; min-height:24px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:400px; height:22px; font-size:16px;">&nbsp;{{text:1}}</span>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Title / Role</div>
        <div style="border-bottom:1px solid #374151; min-height:24px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:400px; height:22px; font-size:16px;">&nbsp;{{text:1}}</span>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Signature</div>
        <div style="border-bottom:1px solid #374151; min-height:84px; padding-bottom:2px;">
          <span style="color:white; background:white; display:inline-block; width:400px; height:80px; font-size:18px;">&nbsp;{{signature}}</span>
        </div>
      </div>

      <div>
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:4px;">Date</div>
        <div style="font-size:11px; border-bottom:1px solid #374151; padding:4px 0 6px 0;">${today}</div>
        <div style="font-size:8px; color:#9ca3af; margin-top:3px;">Exact signing date and time recorded in audit trail</div>
      </div>
    </td>
  </tr>
</table>

<p style="margin-top:28px; font-size:9px; color:#6b7280; text-align:center; border-top:1px solid #e5e7eb; padding-top:12px;">
  Electronic signatures are legally binding pursuant to E-SIGN and UETA. &nbsp;&middot;&nbsp; Ferrum Technology Services, LLC &nbsp;&middot;&nbsp; ferrumit.com
</p>

</body>
</html>`;
}

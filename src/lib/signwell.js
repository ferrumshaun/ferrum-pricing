// signwell.js — SignWell e-signature integration

async function swCall(action, payload) {
  const res = await fetch('/.netlify/functions/signwellProxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `SignWell error ${res.status}`);
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
  testMode = false,
}) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Build the waiver as a plain-text document uploaded as a file
  // SignWell accepts base64-encoded files
  const waiverText = buildWaiverText({ contactName, entityName, title, tier, tierLabel, tierDesc, today, quoteNumber });
  const base64Content = btoa(unescape(encodeURIComponent(waiverText)));

  const result = await swCall('createDocument', {
    test_mode: testMode,
    name: `International Dialing Authorization — ${entityName}${quoteNumber ? ` (${quoteNumber})` : ''}`,
    subject: `Action Required — International Dialing Authorization · ${entityName}`,
    message: `Please review and sign the International Dialing Authorization for your Ferrum Technology Services account. This document enables ${tierLabel} on your hosted SIP trunk. By signing, you acknowledge and accept the terms outlined including full financial responsibility for all international calling charges.`,
    files: [{
      name: 'International_Dialing_Authorization.pdf',
      file_base64: base64Content,
    }],
    recipients: [
      // Client signer (signer 1)
      {
        id: 1,
        name: contactName || clientName,
        email: clientEmail,
        send_email: true,
      },
      // Ferrum signer (signer 2) — placeholder, Shaun signs in SignWell dashboard
      {
        id: 2,
        name: 'Shaun Lang',
        email: 'slang@ferrumit.com',
        send_email: true,
      },
    ],
    // Signature fields — SignWell text tags in the document itself handle placement
    fields: [],
  });

  return {
    documentId: result.id,
    signingUrl: result.signing_url,
    status: result.status,
    createdAt: new Date().toISOString(),
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
function buildWaiverText({ contactName, entityName, title, tier, tierLabel, tierDesc, today, quoteNumber }) {
  return `
INTERNATIONAL DIALING AUTHORIZATION & LIABILITY WAIVER
Ferrum Technology Services, LLC
${quoteNumber ? `Reference: ${quoteNumber}` : ''}
Date: ${today}

This International Dialing Authorization ("Authorization") is entered into as of ${today}, by and between
Ferrum Technology Services, LLC ("Provider") and ${entityName || '[Client Name]'} ("Client").

1. REQUEST FOR INTERNATIONAL CALLING

Client hereby requests that Provider enable ${tierLabel} (${tierDesc}) on Client's hosted SIP
trunking service. Client acknowledges that enabling international calling inherently introduces risk
of unauthorized use and toll fraud.

2. CLIENT ASSUMES ALL FINANCIAL RESPONSIBILITY

Client acknowledges and agrees that it assumes full and sole financial responsibility for all charges
associated with international calling placed through Client's account, whether authorized or
unauthorized. This includes, without limitation, charges resulting from toll fraud, unauthorized access,
compromised credentials, PBX hacking, or any other security incident that results in international
calls being placed through Client's SIP trunk or hosted telephony environment.

THERE IS NO CAP ON CHARGES UNDER THIS AUTHORIZATION.

3. NO CAP ON CHARGES

Client acknowledges that international calling charges are metered and billed as incurred. Provider
shall not be liable for any charges, losses, or damages — including consequential, incidental, or
punitive damages — arising from international calling activity on Client's account.

4. SECURITY RESPONSIBILITY

Client is solely responsible for the security of its telephony environment, including but not limited
to extension passwords, SIP credentials, call routing rules, and network access controls. Provider
recommends Client implement call limits, country restrictions, and off-hours lockouts where available.

5. RIGHT TO SUSPEND

Provider reserves the right to disable international calling immediately and without notice in the
event of suspected fraud, unusual call patterns, or non-payment of charges.

6. INDEMNIFICATION

Client agrees to indemnify, defend, and hold harmless Ferrum Technology Services, LLC and its officers,
employees, and agents from and against any and all claims, liabilities, damages, costs, and expenses
(including reasonable attorneys' fees) arising from or related to international calling activity on
Client's account.

─────────────────────────────────────────────────────────────────────────────
CLIENT SIGNATURE

Full Name:   ${contactName || ''}  [[s|1]]
Title:       ${title || ''}
Business:    ${entityName || ''}
Signature:   [[sig|1]]
Date:        [[date|1]]

─────────────────────────────────────────────────────────────────────────────
FERRUM TECHNOLOGY SERVICES, LLC — COMPANY SIGNATURE

Full Name:   Shaun Lang  [[s|2]]
Title:       Chief Experience Officer
Business:    Ferrum Technology Services, LLC
Signature:   [[sig|2]]
Date:        [[date|2]]

─────────────────────────────────────────────────────────────────────────────
This document was prepared by Ferrum Technology Services, LLC. Electronic signatures are legally
binding pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN) and the
Uniform Electronic Transactions Act (UETA). By signing, all parties agree to the terms above.
`;
}

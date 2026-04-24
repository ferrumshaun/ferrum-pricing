// Netlify serverless function — sends email via SMTP2Go
// Credentials stored as Netlify environment variables:
//   SMTP2GO_USERNAME — your SMTP2Go username
//   SMTP2GO_PASSWORD — your SMTP2Go password
//   SMTP2GO_HOST     — smtp.smtp2go.com (default)
//   SMTP2GO_PORT     — 587 (default)

const FROM_ADDRESS  = 'noreply@fe26.app';
const FROM_NAME     = 'FerrumIT Pricing';
const APP_URL       = process.env.APP_URL || 'https://lustrous-treacle-e0ca6a.netlify.app';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, payload } = body;

  try {
    let emailData;

    switch (action) {

      // ── Send for review ─────────────────────────────────────────────────────
      case 'request_review': {
        const { reviewerEmail, reviewerName, repName, quoteNumber, clientName, quoteId, quoteType, repNote } = payload;
        const quoteUrl = `${APP_URL}/${quoteType}/${quoteId}`;

        emailData = {
          to:      [{ email: reviewerEmail, name: reviewerName }],
          subject: `Review Requested: ${quoteNumber} — ${clientName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
              <div style="margin-bottom: 28px;">
                <div style="display: inline-block; background: #0f1e3c; color: white; padding: 6px 14px; border-radius: 5px; font-size: 13px; font-weight: 700; letter-spacing: 0.03em;">FerrumIT Pricing</div>
              </div>

              <h2 style="font-size: 20px; font-weight: 700; color: #0f1e3c; margin: 0 0 8px;">Quote Review Requested</h2>
              <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">${repName} has requested your review on a quote.</p>

              <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr><td style="padding: 5px 0; color: #6b7280; width: 40%;">Quote Number</td><td style="padding: 5px 0; font-weight: 700; color: #0f1e3c; font-family: monospace;">${quoteNumber}</td></tr>
                  <tr><td style="padding: 5px 0; color: #6b7280;">Client</td><td style="padding: 5px 0; font-weight: 600; color: #0f1e3c;">${clientName}</td></tr>
                  <tr><td style="padding: 5px 0; color: #6b7280;">Requested by</td><td style="padding: 5px 0; color: #374151;">${repName}</td></tr>
                  ${repNote ? `<tr><td style="padding: 5px 0; color: #6b7280; vertical-align: top;">Note</td><td style="padding: 5px 0; color: #374151; font-style: italic;">"${repNote}"</td></tr>` : ''}
                </table>
              </div>

              <a href="${quoteUrl}" style="display: inline-block; background: #0f1e3c; color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">
                Open Quote →
              </a>

              <p style="font-size: 12px; color: #9ca3af; margin: 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
                You can approve this quote or return it with comments directly in the portal.<br>
                <a href="${quoteUrl}" style="color: #2563eb;">${quoteUrl}</a>
              </p>
            </div>
          `
        };
        break;
      }

      // ── Send review response back to rep ────────────────────────────────────
      case 'review_response': {
        const { repEmail, repName, reviewerName, quoteNumber, clientName, quoteId, quoteType, approved, feedback } = payload;
        const quoteUrl  = `${APP_URL}/${quoteType}/${quoteId}`;
        const statusText = approved ? '✓ Approved' : '↩ Returned for revision';
        const statusColor = approved ? '#166534' : '#92400e';
        const statusBg    = approved ? '#dcfce7'  : '#fef3c7';

        emailData = {
          to:      [{ email: repEmail, name: repName }],
          subject: `${approved ? '✓ Approved' : '↩ Returned'}: ${quoteNumber} — ${clientName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
              <div style="margin-bottom: 28px;">
                <div style="display: inline-block; background: #0f1e3c; color: white; padding: 6px 14px; border-radius: 5px; font-size: 13px; font-weight: 700; letter-spacing: 0.03em;">FerrumIT Pricing</div>
              </div>

              <div style="display: inline-block; background: ${statusBg}; color: ${statusColor}; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 700; margin-bottom: 16px;">${statusText}</div>

              <h2 style="font-size: 20px; font-weight: 700; color: #0f1e3c; margin: 0 0 8px;">Quote Review Complete</h2>
              <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">${reviewerName} has reviewed your quote and left feedback.</p>

              <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr><td style="padding: 5px 0; color: #6b7280; width: 40%;">Quote Number</td><td style="padding: 5px 0; font-weight: 700; color: #0f1e3c; font-family: monospace;">${quoteNumber}</td></tr>
                  <tr><td style="padding: 5px 0; color: #6b7280;">Client</td><td style="padding: 5px 0; font-weight: 600; color: #0f1e3c;">${clientName}</td></tr>
                  <tr><td style="padding: 5px 0; color: #6b7280;">Reviewed by</td><td style="padding: 5px 0; color: #374151;">${reviewerName}</td></tr>
                  <tr><td style="padding: 5px 0; color: #6b7280; vertical-align: top;">Decision</td><td style="padding: 5px 0; font-weight: 700; color: ${statusColor};">${statusText}</td></tr>
                  ${feedback ? `<tr><td style="padding: 5px 0; color: #6b7280; vertical-align: top;">Feedback</td><td style="padding: 5px 0; color: #374151; font-style: italic;">"${feedback}"</td></tr>` : ''}
                </table>
              </div>

              <a href="${quoteUrl}" style="display: inline-block; background: #0f1e3c; color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">
                Open Quote →
              </a>

              <p style="font-size: 12px; color: #9ca3af; margin: 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
                <a href="${quoteUrl}" style="color: #2563eb;">${quoteUrl}</a>
              </p>
            </div>
          `
        };
        break;
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    // Send via SMTP2Go API
    const smtpRes = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:  process.env.SMTP2GO_API_KEY,
        sender:   `${FROM_NAME} <${FROM_ADDRESS}>`,
        to:       emailData.to.map(r => `${r.name} <${r.email}>`),
        subject:  emailData.subject,
        html_body: emailData.html,
      })
    });

    const smtpData = await smtpRes.json();

    if (!smtpRes.ok || smtpData.data?.failed?.length > 0) {
      console.error('SMTP2Go error:', JSON.stringify(smtpData));
      return { statusCode: 500, body: JSON.stringify({ error: 'Email send failed', detail: smtpData }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('sendEmail error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

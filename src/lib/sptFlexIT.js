// sptFlexIT.js — builds a Smart Pricing Table proposal payload that mirrors
// the FlexIT On-Demand IT Support template (template id RKshoc6dAEeA).
//
// The template has 6 pages:
//   1. Cover Page              — uses [proposal_name], [recipient_*], etc. placeholders
//   2. Service & Billing       — scope of work with the FlexIT Base Plan line item(s)
//   3. Assumptions             — 7 fixed T&M bullets
//   4. Rate Card               — full rate tables (we substitute market-adjusted rates)
//   5. Payment Schedule & Terms — uses [netterms_cv-...] / [termofagreement_cv-...] / [proposal_total type=once]
//   6. Acceptance Terms        — MSA + Service Attachments
//
// Custom variable IDs are kept identical to the template so the [..._cv-...] placeholders resolve.
//   - mnekple0ts  → net-terms        = "Due Upon Receipt"
//   - mnekple0q1  → term-of-agreement = "Month to Month"

import { fmtRate } from './rateSheet';

// ── Small helpers ────────────────────────────────────────────────────────────
const escHtml = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmt$ = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Cover Page ───────────────────────────────────────────────────────────────
// Placeholders are left intact — SPT substitutes them at render time from
// settings.recipient, the proposal name, and the creator profile.
function coverPageHtml() {
  return `<!-- tiny-editor-content -->
<p>&nbsp;</p>
<p style="text-align: center;"><img style="max-width: 100%; height: auto;" src="https://images.sptresources.online/04033d55-b1fe-4941-9d7e-6b9455744482" alt="logo" width="381"><br><br></p>
<h3 style="text-align: center; line-height: 1.75;"><strong><span style="color: white; background-color: black; font-size: 36px;">&nbsp;[proposal_name]&nbsp;</span></strong><br>for <strong>[recipient_company_name]</strong></h3>
<p>&nbsp;</p>
<p style="text-align: center;"><em><span style="color: #7e8c8d;">As requested by</span></em><br><strong>[recipient_contact_full_name]</strong><br><br>[proposal_creation_date]</p>
<p>&nbsp;</p>
<p style="text-align: center;"><strong><a href="#page-V6jn9hKHQL9P" data-page-link="V6jn9hKHQL9P"><button type="button" class="spt-button" contenteditable="false" data-hover-shadow="false" data-hover-color-adjust="false" style="border: none; border-image: none; border-radius: 49px; background-color: #c51111; background-image: none; opacity: 1; box-shadow: none; color: #ffffff; padding-top: 24px; padding-bottom: 24px; padding-left: 42px; padding-right: 42px; box-sizing: border-box; font-size: 21px !important">View Service &amp; Billing Overview</button></a></strong></p>
<p>&nbsp;<br>&nbsp;</p>
<table class="user-table responsive-strategy-stack" style="width: 90%; background-color: #ecf0f1; border-color: white; border-style: hidden;" align="center"><colgroup><col style="width: 50%;"><col style="width: 50%;"></colgroup>
<tbody>
<tr>
<td style="border-color: white; text-align: center;"><br>[proposal_creator_full_name]<br>[proposal_creator_position_title]<br>[company_name]<br><br></td>
<td style="border-color: white; text-align: center;"><br>[proposal_creator_email_address]<br>[proposal_creator_phone_number]<br>[company_website]<br><br></td>
</tr>
</tbody>
</table>`;
}

// ── Assumptions ──────────────────────────────────────────────────────────────
// 7 fixed bullets — same text as FlexITQuotePage's FLEXIT_ASSUMPTIONS constant.
function assumptionsHtml() {
  const bullets = [
    'Client engages Ferrum Technology Services on an as-needed, break/fix basis with no ongoing managed services agreement in place.',
    'All services are rendered on a time and materials basis. Rates, billing increments, after-hours premiums, and holiday rates are defined in the Rate Card attached to this agreement.',
    'No service level commitments, guaranteed response times, or priority scheduling are implied or guaranteed under this plan.',
    'Client is responsible for providing timely access to systems, personnel, and facilities. Delays caused by lack of access may result in additional billable time.',
    'Onsite dispatch is subject to technician availability. Same-day or emergency dispatch is not guaranteed and may be subject to rates outlined in the Rate Card.',
    'Client acknowledges that time and materials engagements are not capped unless a not-to-exceed amount is explicitly agreed upon in writing prior to work commencing.',
    'Hardware, software, licensing, and third-party services procured on behalf of the client are billed separately. All such sales are final &mdash; no returns or refunds.',
  ];
  return `<!-- tiny-editor-content -->
<h3 style="text-align: center; line-height: 1;"><span style="color: #ffffff; background-color: #000000; font-size: 36px;"><strong>Assumptions</strong></span></h3>
<blockquote>
<ul>
${bullets.map(b => `<li>${b}</li>`).join('\n')}
</ul>
</blockquote>`;
}

// ── Rate Card ────────────────────────────────────────────────────────────────
// Reproduces the template's three rate tables but with market-adjusted rates
// from buildRateSheet().
function rateCardRow(label, rateText) {
  return `<tr>
<td style="border-color: #95a5a6;">${label}</td>
<td style="border-color: #95a5a6;">${rateText}</td>
</tr>`;
}

function rateCardSectionHtml(title, items) {
  return `<h3 style="text-align: center;"><span style="background-color: #000000; color: #ffffff; font-size: 36px;">${title}</span></h3>
<table class="user-table responsive-strategy-scroll" style="border-color: #95a5a6; border-style: solid; width: 100%;"><colgroup><col style="width: 450px;"><col></colgroup>
<tbody>
${items.map(i => rateCardRow(escHtml(i.service), escHtml(fmtRate(i)))).join('\n')}
</tbody>
</table>`;
}

function rateCardHtml(rateSheet) {
  // Combine onsite + afterhours into one "On-Site Labor & Dispatches" table to match template.
  const onsiteSection = rateSheet.sections.find(s => s.id === 'onsite');
  const afterSection  = rateSheet.sections.find(s => s.id === 'afterhours');
  const remoteSection = rateSheet.sections.find(s => s.id === 'remote');
  const devSection    = rateSheet.sections.find(s => s.id === 'dev');

  const onsiteCombined = [
    ...(onsiteSection?.items || []),
    // Group dispatch + additional rows under one human-readable label for each window
    { service: 'Weekdays 5pm–11pm', label: dispatchLabel(afterSection, 'Weekdays 5pm') },
    { service: 'Weekends 7am–5pm',  label: dispatchLabel(afterSection, 'Weekends 7am') },
    { service: 'Saturday 5pm–11pm', label: dispatchLabel(afterSection, 'Saturday 5pm') },
    { service: 'Graveyard & Sundays', label: dispatchLabel(afterSection, 'Graveyard') },
    ...((afterSection?.items || []).filter(i => i.service === 'Exceptional Charges')),
  ];

  return `<!-- tiny-editor-content -->
<h3 style="text-align: center;"><strong><span style="color: #ffffff; background-color: #000000; font-size: 36px;">&nbsp;Rate Card&nbsp;</span></strong></h3>
<p>The following rates apply to all time and materials engagements under the FlexIT Plan. All labor is billed as incurred &mdash; from the moment work begins through completion, including diagnostics, remediation, configuration, vendor coordination, and any associated follow-up. Time is tracked in the increments noted below and invoiced upon completion of each engagement or at the close of the billing period, whichever comes first.</p>
<p>Rates are reviewed periodically and are subject to change with advance notice. The rates in effect at the time of service will apply to that engagement.</p>
${rateCardSectionHtml('Remote Labor &amp; Support', remoteSection?.items || [])}
<h3 style="text-align: center; line-height: 1;"><strong><span style="background-color: #000000; color: #ffffff; font-size: 36px;">&nbsp;Application, Website, &amp; Development&nbsp;</span></strong></h3>
<p><span style="background-color: #ffffff; color: #000000;">Any custom application or development needs will be addressed under a separate scope of work and project summary.</span></p>
<table class="user-table responsive-strategy-scroll" style="border-color: #95a5a6; border-style: solid; width: 100%;"><colgroup><col style="width: 450px;"><col></colgroup>
<tbody>
${(devSection?.items || []).map(i => rateCardRow(escHtml(i.service), escHtml(fmtRate(i)))).join('\n')}
</tbody>
</table>
${rateCardSectionHtml('&nbsp;On-Site Labor &amp; Dispatches&nbsp;', onsiteCombined)}`;
}

// Pulls the dispatch + additional-hourly rates for a window, combines like the template:
// "$300 Dispatch / Additional $247.50/hr"
function dispatchLabel(afterSection, windowPrefix) {
  if (!afterSection) return '—';
  const dispatch = afterSection.items.find(i => i.service.startsWith(windowPrefix) && i.service.includes('Dispatch'));
  const additional = afterSection.items.find(i => i.service.startsWith(windowPrefix) && i.service.includes('Additional'));
  const dRate = dispatch?.rate != null ? fmt$(dispatch.rate) : '—';
  const aRate = additional?.rate != null ? `${fmt$(additional.rate)}/hr` : '—';
  return `${dRate} Dispatch / Additional ${aRate}`;
}

// ── Payment Schedule & Terms ─────────────────────────────────────────────────
// Uses [proposal_total type=once] and the [..._cv-...] custom variable references
// so the rendered values stay in sync with line item changes inside SPT.
function paymentScheduleHtml() {
  return `<!-- tiny-editor-content -->
<h3 style="text-align: center;"><span style="background-color: #000000; color: #ffffff; font-size: 36px;">&nbsp;<strong>Payment</strong> <strong>Schedule &amp; Terms</strong>&nbsp;</span></h3>
<p>The company and client agree to the following payment schedule.</p>
<p>Term of this agreement is <strong><span style="background-color: #fbeeb8;">[termofagreement_cv-mnekple0q1].</span></strong></p>
<table class="user-table responsive-strategy-scroll" style="width: 100%; background-color: #ffffff; border: 1px solid #CED4D9;" border="1"><colgroup><col style="width: 12.7418%;"><col style="width: 16.3823%;"><col style="width: 70.876%;"></colgroup>
<tbody>
<tr style="background-color: #f4f4f4; border-color: #ced4d9; height: 20px;">
<td style="border-color: #ced4d9; height: 20px; border-width: 1px;"><span style="color: #000000;"><strong>Payment #</strong></span></td>
<td style="border-color: #ced4d9; border-width: 1px;"><span style="color: #000000;"><strong>Amount</strong></span></td>
<td style="border-color: #ced4d9; height: 20px; border-width: 1px;"><span style="color: #000000;"><strong>Due Date</strong></span></td>
</tr>
<tr style="height: 20px;">
<td style="border-color: #ced4d9; height: 20px; border-width: 1px;">#1</td>
<td style="border-color: #ced4d9; border-width: 1px;">[proposal_total type=once]</td>
<td style="border-color: #ced4d9; height: 20px; border-width: 1px;">Upon <strong>Agreement Signing.</strong>&nbsp;</td>
</tr>
</tbody>
</table>
<p>Payment #1 is non-refundable.&nbsp;</p>
<p><em>Any items not explicitly included in this quote are considered out of scope. Out-of-scope services will be quoted separately as a project or billed at the then-current hourly rates, subject to customer approval prior to commencement of work.</em></p>
<h3 style="text-align: center;"><span style="color: #ffffff; background-color: #000000; font-size: 36px;">Billing &amp; Payment Terms</span></h3>
<p><strong>Automatic Payments (Required)</strong><br>For recurring billing purposes, the Client is required to maintain a valid <strong>ACH/EFT or credit card</strong> on file for automatic payment processing. In lieu of automatic debit, the Client may elect to remit payment via <strong>direct EFT, bank wire, or ACH transfer using our online billing portal at <a href="https://ferrumit.com/billing" target="_blank" rel="noopener">https://ferrumit.com/billing</a>.</strong>&nbsp;Account and remittance information for these options may be obtained by contacting [company_name]'s finance team at <strong><a rel="noopener">billing@ferrumit.com</a></strong>.</p>
<p><span style="background-color: #fbeeb8;">Payment information must be submitted or confirmed prior to the commencement of services. Recurring invoices will be processed automatically using the agreed payment method in accordance with the billing schedule.</span></p>
<p><a href="https://ferrumit.benjipays.com/portal/f29b856adaae4f32c5435407a114ac37d62a5733c6e9c60c4c6834145a23409b/cardrequest/" target="_blank" rel="noopener"><span style="background-color: #fbeeb8;">Please complete our payment registration process online by clicking here.</span></a></p>
<p><strong>Invoicing Terms</strong><br>Services are invoiced with <strong>[netterms_cv-mnekple0ts]</strong>&nbsp;payment terms. Invoices will be automatically paid on the due date using the payment method on file.</p>
<p><strong>Paper Check Payments</strong><br>While electronic payment is required for recurring billing, any paper checks received will incur a <strong>$10 administrative processing and handling fee</strong>.</p>
<p><strong>Purchase Orders</strong><br>If a purchase order is required, please submit it to <strong><a rel="noopener">billing@ferrumit.com</a></strong> prior to invoicing.</p>
<p><strong>Documentation and Support Fees</strong><br>Documentation and support fees, as outlined in this Quote, are billed in equal monthly installments.</p>
<p><strong>Setup Services Fee</strong><br>A one-time setup, configuration, and installation fee is due at the start of the agreement and will be billed as specified in this Quote.</p>
<p><strong>Declined or Returned Payments</strong><br>Any declined or returned payments may incur a <strong>$50 administrative fee.</strong></p>
<p><strong>Hardware, Software, Licensing &amp; Third-Party Services</strong><br>All sales of hardware, software, licensing, and third-party services are <strong>final</strong>. Please review and verify all orders prior to submission, as returns or refunds are not available.</p>`;
}

// ── Acceptance Terms ─────────────────────────────────────────────────────────
function acceptanceTermsHtml() {
  return `<h3 style="text-align: center;"><span style="font-size: 36px;"><strong><span style="background-color: rgb(0, 0, 0); color: rgb(255, 255, 255);">&nbsp;Acceptance Terms&nbsp;</span></strong></span></h3><p><strong><span style="text-decoration: underline;">Acceptance and Incorporation by Reference</span></strong></p><p>This Order together with the Master Services Agreement and Service Attachments and other terms and conditions identified on Exhibit A, all of which are incorporated herein by reference (collectively, the &ldquo;Agreement&rdquo;) is between Ferrum Technology Services, LLC (sometimes referred to as &ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our,&rdquo; or &ldquo;Provider&rdquo;), and the customer identified on the Order (sometimes referred to as &ldquo;you,&rdquo; &ldquo;your,&rdquo; or &ldquo;Client&rdquo;). This Agreement is effective as of the date the Client accepts the Order (the &ldquo;Effective Date&rdquo;).&nbsp;</p><p>By signing or accepting this Order, Client acknowledges, represents, and warrants that it has read and agrees to the terms and conditions identified on Exhibit A to this Order which are incorporated as if fully set forth herein.&nbsp;</p><p>The parties hereby agree that electronic signatures to this Order shall be relied upon and will bind them to the obligations stated herein. Each party hereby warrants and represents that it has the express authority to execute this Agreement(s).&nbsp;</p><p>Provider may make changes to the Agreement at any time. If there are changes, Provider will revise the date at the top of the document. &nbsp;Provider may or may not provide Client with additional notice regarding such changes. Client should review the terms and conditions regularly. Unless otherwise noted, the amended terms and conditions will be effective immediately, and your continued use of the Services thereafter constitutes your acceptance of the changes. If you do not agree to the amended terms and conditions, you must stop using the Services immediately. &nbsp;Please note, you may incur a termination fee or other third-party fees, if applicable. &nbsp; You may access the current version of the terms and conditions at any time by visiting <a href="https://ferrumit.com/legal">https://ferrumit.com/legal</a>.</p><h4><strong>Exhibit A</strong></h4><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/MSA" target="_blank" rel="noopener">Master Services Agreement</a></p><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/Managed-IT-Attachment" target="_blank" rel="noopener">Service Attachment for Managed Services</a></p><p style="line-height: 1;"><a href="https://mspterms.live/ferrum-technology/Video-Surveillance-Attachment" target="_blank" rel="noopener">Service Attachment for Managed Video Surveillance Services</a></p><p style="line-height: 1;"><a href="https://mspterms.live/ferrum-technology/Access-Control-Attachment" target="_blank" rel="noopener">Service Attachment for Managed Access Control Services</a></p><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/Compliance-Attachment" target="_blank" rel="noopener">Service Attachment for Managed Compliance Services</a></p><p style="line-height: 1;"><a href="https://docs.ourterms.live/ferrum-technology/DBA-Attachment.pdf" target="_blank" rel="noopener">Service Attachment for Managed Database Administration</a></p><p style="line-height: 1;"><a href="https://mspterms.live/ferrum-technology/Pen-Testing-Attachment" target="_blank" rel="noopener">Service Attachment for Penetration Testing</a></p><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/AI-Attachment">Service Attachment for Artificial Intelligence Services</a></p><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/Co-managed-Attachment">Service Attachment for Co-Managed Services</a></p><p style="line-height: 1;"><a href="https://ferrumit.com/legal/App-Dev-Attachment?hsLang=en" target="_blank" rel="noopener">Service Attachment for Application Development</a></p><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/Schedule-of-Services">Schedule of Services</a></p><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/DPA">Data Processing Agreement</a></p><p style="line-height: 1;"><a href="https://mspterms.live/Ferrum-Technology-Services/SLO">Service Level Objectives</a></p><p style="line-height: 1;"><a href="https://vendors.ourterms.live/ferrum-technology" target="_blank" rel="noopener">Schedule of Third-Party Services</a></p>`;
}

// ── Line item description (dynamic — uses actual prepay hours/amount) ────────
// When `hasFlexBlock` is true, the flex block IS the upfront fee and the
// "New Account — Initial Engagement" pre-payment paragraph is dropped. The
// prepay paragraph would otherwise read "$0.00 pre-payment is required" which
// is both meaningless and contradicts the flex block line that follows.
function basePlanDescription({ prepayHours, prepayAmount, hasFlexBlock }) {
  const intro = `<!-- tiny-editor-content -->
<p>Time and materials support services covering remote and onsite technical labor. All time is tracked from the moment work begins and billed at the published hourly rate &mdash; including diagnostics, remediation, configuration, vendor coordination, and follow-up. There are no included hours, credits, or retainers under this plan; every unit of effort is invoiced as incurred. Applicable rates and billing increments are outlined in the Rate Card attached to this agreement.</p>`;
  if (hasFlexBlock) {
    return `${intro}
<p><strong>Upfront Engagement:</strong></p>
<p>This engagement is initiated with the Flex Block pre-purchase listed below &mdash; that block fee is paid in full upon agreement signing and serves as the engagement&rsquo;s initial commitment. No separate hourly pre-payment is required. Time on engagements is drawn from the block first; once the block is exhausted, additional time is billed at the published rates per the Rate Card.</p>`;
  }
  const hoursLbl = prepayHours === 1 ? '1-hour' : `${prepayHours}-hour`;
  return `${intro}
<p><strong>New Account &mdash; Initial Engagement:</strong></p>
<p>A ${hoursLbl} labor pre-payment (${fmt$(prepayAmount)}) is required prior to any services being rendered. This pre-payment is applied toward the first billable engagement, whether remote or onsite. Ongoing per-engagement minimums are defined in the attached Rate Card.</p>`;
}

function flexBlockDescription({ flexHours, blockPrice, ratePerHour }) {
  return `<!-- tiny-editor-content -->
<p>Pre-purchased block of ${flexHours} labor hours at a discounted rate of <strong>${fmt$(ratePerHour)}/hr</strong>. Block is valid for 12 months from purchase date and may be applied to any remote or onsite engagement under this agreement.</p>
<p><strong>Rate Lock:</strong> If client refills this block within 30 days of depletion or expiration, the original agreed-upon rate is honored on the refill.</p>
<p>Hours are consumed in the increments defined in the Rate Card. Block hours expire at end of term unless refilled.</p>`;
}

// ── Design — copied from template so the proposal renders with the same theme ─
const FLEXIT_DESIGN = {
  colors: {
    proposal_header: { text: '#ffffff', background: '#450112' },
    group_heading: {
      text: '#ffffff', checkbox: '#ffffff', quantity: '#000000',
      checkmark: '#000000', background: '#cb0033', quantity_font: '#ffffff',
    },
    line_item: { fontColor: '#000000' },
    proposal_navigation: {
      background: '#ca0033', link: '#ffffff', selected_link: '#8b368d',
      highlight_color: '#fddfff', highlight_border: '#5f0219',
    },
    logo: { background: 'linear-gradient(183deg, #ffffff 0%, #fbc0c0 100%)', divider_line: '#a3032b' },
    primary_button_background: '#44011e',
    primary_button_color: '#ffffff',
    primary_button_border_color: '#7d4e63',
    secondary_button_background: '#910617',
    secondary_button_color: '#ffffff',
    secondary_button_border_color: '#b7d0ff',
    links: { color: '#000000' },
  },
  backgrounds: {
    main: {
      size: 'cover',
      image: 'https://pub-7a9bb069b479455ca38dce58f9412caf.r2.dev/bb3511af-2ea9-4cb8-b0a8-0c52139e01a5',
      colors: { font: '#ffffff', background: 'linear-gradient(180deg, #cb0033 0%, #200000 100%)' },
      repeat: 'no-repeat', opacity: 13, position: 'top', attachment: 'fixed',
    },
    page: {
      size: '100%',
      image: 'https://pub-7a9bb069b479455ca38dce58f9412caf.r2.dev/70bef9da-2cb2-4b6d-bd59-7a21728af3de',
      colors: { font: '#000000', background: 'linear-gradient(180deg, #eaf1ff 0%, #ffffff 100%)' },
      repeat: 'no-repeat', opacity: 30, position: 'top', attachment: 'scroll',
    },
  },
  styling: {
    button_radius: 15, group_radius: 19, button_shadow: 2, group_shadow: 2,
    button_border_width: 0, quantity_radius: 8, page_radius: 15,
  },
  fonts: {
    default: { bold: false, size: 'medium', family: 'Space Grotesk' },
    navigation: { bold: false, family: 'Use Default' },
    heading: { bold: true, family: 'Use Default' },
    group_heading: { bold: true, family: 'Use Default' },
    line_item: { bold: false, family: 'Use Default' },
    button: { bold: false, family: 'Use Default' },
    content: { bold: false, family: 'Use Default' },
    pricing: { bold: false, family: 'Use Context' },
  },
};

// ── Main builder ─────────────────────────────────────────────────────────────
//
// Inputs:
//   quote      — { proposalName, clientName, clientContact, clientEmail, clientAddress,
//                  marketCity, marketState, prepayHours, prepayAmount, remoteRate,
//                  flexHours, flexBlockPrice, flexBlockRatePerHour,
//                  quoteNumber }
//   rateSheet  — output of buildRateSheet({ analysis, settings, ... })
//   settings   — pricing_settings record (used for hourlyTasks rate hints)
//
// Output: SPT proposal payload (POST body for /proposals create endpoint)
export function buildFlexITSPTPayload({ quote, rateSheet, settings = {} }) {
  if (!rateSheet) throw new Error('buildFlexITSPTPayload requires a rateSheet (call buildRateSheet first)');

  const proposalName = quote.proposalName
    || `FlexIT On-Demand — ${quote.clientName || 'Client'}${quote.quoteNumber ? ` (${quote.quoteNumber})` : ''}`;

  // ── Line items for the Service & Billing Overview scope ─────────────────────
  const hasFlexBlock = quote.flexHours > 0 && quote.flexBlockPrice > 0;
  const lineItems = [
    {
      name: 'FlexIT Base Plan — Time & Materials (Break/Fix)',
      description: basePlanDescription({
        prepayHours: quote.prepayHours || 2,
        prepayAmount: quote.prepayAmount || 0,
        hasFlexBlock,
      }),
      price: { model: 'fixed', value: Number(quote.prepayAmount || 0), frequency: 'once' },
      isOptional: false,
      isSelected: true,
      taxExempt: true,
      markupExempt: false,
      discountExempt: false,
      internalNotes: '',
      modificationsLabel: '',
      startExpanded: false,
      order_key: 1,
      selectionType: 'multiple',
      kind: 'line',
    },
  ];

  // Optional Flex Block pre-purchase (only if hours > 0 and price > 0)
  if (hasFlexBlock) {
    lineItems.push({
      name: `Flex Block — ${quote.flexHours}hrs Pre-Purchase`,
      description: flexBlockDescription({
        flexHours: quote.flexHours,
        blockPrice: quote.flexBlockPrice,
        ratePerHour: quote.flexBlockRatePerHour || (quote.flexBlockPrice / quote.flexHours),
      }),
      price: { model: 'fixed', value: Number(quote.flexBlockPrice), frequency: 'once' },
      isOptional: false,
      isSelected: true,
      taxExempt: true,
      markupExempt: false,
      discountExempt: false,
      internalNotes: '',
      modificationsLabel: '',
      startExpanded: false,
      order_key: 2,
      selectionType: 'multiple',
      kind: 'line',
    });
  }

  // ── Pages ────────────────────────────────────────────────────────────────────
  const pages = [
    {
      name: 'Cover Page',
      content: coverPageHtml(),
      order_key: 1,
      kind: 'page',
      isScopeOfWork: false,
      isSignaturesPage: false,
      displayHeading: false,
      hideSection: false,
      excludeFromPdf: false,
      designSettings: {
        backgroundSize: '100% auto',
        backgroundColor: 'linear-gradient(180deg, #ffebeb 0%, #ffffff 100%)',
        backgroundImage: 'https://images.sptresources.online/95ba2c6b-68f0-41c2-b7ba-f63361c8101c',
        backgroundRepeat: 'no-repeat',
      },
    },
    {
      name: 'Service & Billing Overview',
      content: '',
      order_key: 2,
      kind: 'page',
      isScopeOfWork: true,
      isSignaturesPage: false,
      showCents: true,
      salesTaxPercentage: '0',
      lineItemsStartExpanded: 'none',
      selectionType: 'multiple',
      markupPercentage: '',
      discounts: [],
      hideTotalsTop: false,
      hideTotalsBottom: false,
      displayHeading: true,
      hideSection: false,
      excludeFromPdf: false,
      designSettings: { backgroundRepeat: 'no-repeat' },
      children: [
        {
          name: 'FlexIT Services',
          isOptional: false,
          isSelected: true,
          order_key: 1000,
          lineItems,
          tags: [],
          displayCost: 'show_all',
          selectionType: 'single',
          hideQuantities: false,
          startExpanded: false,
          in_library: false,
          kind: 'group',
        },
      ],
    },
    {
      name: 'Assumptions',
      content: assumptionsHtml(),
      order_key: 3,
      kind: 'page',
      isScopeOfWork: false,
      isSignaturesPage: false,
      displayHeading: false,
      hideSection: false,
      excludeFromPdf: false,
      designSettings: {
        backgroundColor: 'linear-gradient(180deg, #ffebeb 0%, #ffffff 100%)',
        backgroundRepeat: 'no-repeat',
      },
    },
    {
      name: 'Rate Card',
      content: rateCardHtml(rateSheet),
      order_key: 4,
      kind: 'page',
      isScopeOfWork: false,
      isSignaturesPage: false,
      displayHeading: false,
      hideSection: false,
      excludeFromPdf: false,
      designSettings: {
        backgroundColor: 'linear-gradient(180deg, #ffd4d4 0%, #ffffff 100%)',
        backgroundRepeat: 'no-repeat',
      },
    },
    {
      name: 'Payment Schedule & Terms',
      content: paymentScheduleHtml(),
      order_key: 5,
      kind: 'page',
      isScopeOfWork: false,
      isSignaturesPage: false,
      displayHeading: false,
      hideSection: false,
      excludeFromPdf: false,
      designSettings: {
        backgroundColor: 'linear-gradient(180deg, #ffd4d4 0%, #ffffff 100%)',
        backgroundRepeat: 'no-repeat',
      },
    },
    {
      name: 'Acceptance Terms',
      content: acceptanceTermsHtml(),
      order_key: 6,
      kind: 'page',
      isScopeOfWork: false,
      isSignaturesPage: false,
      displayHeading: false,
      hideSection: false,
      excludeFromPdf: false,
      designSettings: {
        backgroundColor: 'linear-gradient(180deg, #ffd4d4 0%, #ffffff 100%)',
        backgroundRepeat: 'no-repeat',
      },
    },
  ];

  // ── Custom variables — keep the template's IDs verbatim so [..._cv-...] resolves
  const custom_variables = [
    {
      id: 'mnekple0ts',
      type: 'single-line',
      label: 'net-terms',
      order: 0,
      value: 'Due Upon Receipt',
      source: 'template',
      required: true,
      who_provides: 'we-do',
    },
    {
      id: 'mnekple0q1',
      type: 'single-line',
      label: 'term-of-agreement',
      order: 1,
      value: 'Month to Month',
      source: 'template',
      required: true,
      who_provides: 'we-do',
    },
  ];

  return {
    name: proposalName,
    status: 'DRAFT',
    pages,
    custom_variables,
    settings: {
      signing: {
        use_accept: false,
        company_signer: 'none',
        custom_company_signer_name: '',
        custom_company_signer_email: '',
      },
      recipient: {
        name: quote.clientName || '',
        address: quote.clientAddress || '',
        contact: {
          name:  quote.clientContact || '',
          email: quote.clientEmail   || '',
        },
        website: '',
      },
      notifications: {
        rules: [
          { id: 'import-viewed',    event: 'proposal_opened', emails: [] },
          { id: 'import-finalized', event: 'proposal_won',    emails: [] },
        ],
      },
      avoid_line_item_page_breaks: false,
      hide_pdf_download: false,
      disable_proposal_access: false,
      hide_unselected_from_recipient: false,
      currency: 'USD',
      expiring_on: null,
      // Hourly task hints — populated from market-adjusted rates so they default
      // sensibly when ad-hoc time entries are added in SPT.
      hourlyTasks: [
        { name: 'Remote Support', order: 0, price: Math.round(rateSheet.sections.find(s => s.id === 'remote')?.items[0]?.rate || 165) },
        { name: 'On-Site Labor',  order: 1, price: Math.round(rateSheet.sections.find(s => s.id === 'onsite')?.items[0]?.rate || 165) },
        { name: 'Development',    order: 2, price: Math.round(rateSheet.sections.find(s => s.id === 'dev')?.items[0]?.rate    || 220) },
      ],
    },
    design: FLEXIT_DESIGN,
    integrations: { crm: null },
    is_template: false,
    is_library:  false,
    is_starred:  false,
    tags: [
      'flexit',
      'on-demand',
      'time-and-materials',
      'ferrum-iq',
      ...(quote.flexHours > 0 ? ['flex-block'] : []),
    ],
  };
}

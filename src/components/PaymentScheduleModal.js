import React from 'react';
import { fmt$, fmt$0 } from '../lib/pricing';

export default function PaymentScheduleModal({
  onClose, quoteId, quoteNumber, clientName,
  result, obIncentive, inputs, settings, selectedPkg,
}) {
  if (!result) return null;

  const contractTerm   = inputs?.contractTerm || 24;
  const baseMRR        = result.finalMRR;
  const baseOnboarding = result.onboarding;
  const effectiveOnb   = obIncentive?.effectiveFee ?? baseOnboarding;
  const mode           = obIncentive?.mode;

  const ccSurcharge = parseFloat(settings?.payment_cc_surcharge || 0.02);
  const checkFee    = parseFloat(settings?.payment_check_fee    || 10);
  const returnedFee = 50; // declined/returned payment fee

  // Build the two key schedule rows matching the PDF format
  const scheduleRows = buildScheduleRows({ contractTerm, baseMRR, baseOnboarding, effectiveOnb, obIncentive, mode });

  // Onboarding label
  const onbLabel = mode === 'discount' && obIncentive?.discountPct === 100
    ? 'Onboarding fee waived'
    : mode === 'discount' && obIncentive?.discountPct > 0
      ? `Onboarding fee — ${obIncentive.discountPct}% discount applied`
      : 'Setup, Configuration & Installation Fee';

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'stretch', justifyContent:'flex-end', zIndex:600 }}>
      <div style={{ flex:1 }} onClick={onClose} />
      <div style={{ width:620, background:'white', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ background:'#0f1e3c', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>Payment Schedule</div>
            <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>
              {clientName || 'Client'} · {quoteNumber || 'Unsaved'} · {contractTerm}-month term
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:20 }}>

          {/* Term header */}
          <div style={{ background:'#f0f4ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'10px 14px', marginBottom:16, textAlign:'center' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#0f1e3c' }}>
              Term of this agreement is {contractTerm} MONTHS
            </span>
          </div>

          {/* Onboarding incentive note */}
          {mode && mode !== 'none' && (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, padding:'8px 12px', marginBottom:14 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#166534' }}>✓ Onboarding Incentive — </span>
              <span style={{ fontSize:11, color:'#374151' }}>
                {mode === 'split'
                  ? `Onboarding of ${fmt$0(baseOnboarding)} split over ${obIncentive.splitMonths} months (+${fmt$0(obIncentive.monthlyAdd)}/mo)`
                  : obIncentive?.discountPct === 100 ? 'Full onboarding waiver applied'
                  : `${obIncentive?.discountPct}% discount — ${fmt$0(baseOnboarding)} → ${fmt$0(effectiveOnb)}`}
              </span>
            </div>
          )}

          {/* Payment schedule table — matches PDF layout */}
          <div style={{ marginBottom:20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #e5e7eb', borderRadius:6, overflow:'hidden' }}>
              <thead>
                <tr style={{ background:'#0f1e3c' }}>
                  <th style={TH}>Payment</th>
                  <th style={TH}>Amount</th>
                  <th style={TH}>Due Date / Trigger</th>
                </tr>
              </thead>
              <tbody>
                {/* Payment #1 — onboarding/setup fee at signing */}
                <tr style={{ borderBottom:'1px solid #e5e7eb', background:'#fffbeb' }}>
                  <td style={TD}><span style={{ fontWeight:700, color:'#374151' }}>#1 — {onbLabel}</span></td>
                  <td style={{ ...TD, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#0f1e3c' }}>
                    {fmt$0(effectiveOnb)}
                  </td>
                  <td style={{ ...TD, color:'#6b7280' }}>Upon agreement signing</td>
                </tr>

                {/* Split payment rows (if applicable) */}
                {mode === 'split' && obIncentive?.splitMonths > 0 && (
                  <tr style={{ borderBottom:'1px solid #e5e7eb', background:'#f0fdf4' }}>
                    <td style={TD}><span style={{ fontWeight:600, color:'#374151' }}>Onboarding installments (×{obIncentive.splitMonths})</span></td>
                    <td style={{ ...TD, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#0f766e' }}>
                      +{fmt$0(obIncentive.monthlyAdd)}/mo
                    </td>
                    <td style={{ ...TD, color:'#6b7280' }}>Added to first {obIncentive.splitMonths} monthly invoices</td>
                  </tr>
                )}

                {/* Monthly billing commencement */}
                <tr style={{ borderBottom:'1px solid #e5e7eb' }}>
                  <td style={TD}>
                    <span style={{ fontWeight:700, color:'#374151' }}>Monthly Billing Commencement</span>
                    <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>{selectedPkg?.name || 'Managed IT Services'}</div>
                  </td>
                  <td style={{ ...TD, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#0f1e3c' }}>
                    {fmt$0(baseMRR)}<span style={{ fontSize:9, color:'#6b7280', fontWeight:400 }}>/mo</span>
                    {mode === 'split' && obIncentive?.monthlyAdd > 0 && (
                      <div style={{ fontSize:9, color:'#0f766e' }}>({fmt$0(baseMRR + obIncentive.monthlyAdd)}/mo first {obIncentive.splitMonths} months)</div>
                    )}
                  </td>
                  <td style={{ ...TD, color:'#6b7280', fontSize:10 }}>
                    Upon onboarding completion or 30 days after agreement commencement (whichever comes first)
                  </td>
                </tr>

                {/* Contract summary row */}
                <tr style={{ background:'#f8fafc' }}>
                  <td colSpan={2} style={{ ...TD, fontWeight:700, color:'#374151' }}>
                    Total Contract Value ({contractTerm} months)
                  </td>
                  <td style={{ ...TD, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#0f1e3c', fontSize:13 }}>
                    {fmt$0(baseMRR * contractTerm + effectiveOnb)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize:9, color:'#dc2626', marginTop:6, fontWeight:600 }}>
              * Payment #1 is non-refundable.
            </div>
          </div>

          {/* Out of scope note */}
          <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:5, padding:'8px 12px', marginBottom:16, fontSize:11, color:'#92400e', lineHeight:1.6 }}>
            Any items not explicitly included in this quote are considered out of scope. Out-of-scope services will be quoted separately as a project or billed at the then-current hourly rates, subject to customer approval prior to commencement of work.
          </div>

          {/* Billing & Payment Terms */}
          <Section title="Billing & Payment Terms">
            <SubSection title="Automatic Payments (Required)">
              For recurring billing purposes, the Client is required to maintain a valid ACH/EFT or credit card on file for automatic payment processing. In lieu of automatic debit, the Client may elect to remit payment via direct EFT, bank wire, or ACH transfer using our online billing portal at{' '}
              <a href="https://ferrumit.com/billing" target="_blank" rel="noopener noreferrer" style={{ color:'#2563eb' }}>ferrumit.com/billing</a>.
              Account and remittance information may be obtained by contacting Ferrum Technology Services, LLC's finance team at{' '}
              <a href="mailto:billing@ferrumit.com" style={{ color:'#2563eb' }}>billing@ferrumit.com</a>.
              Payment information must be submitted prior to commencement of services.
            </SubSection>

            <SubSection title="Invoicing Terms">
              Services are invoiced with <strong>NET 20</strong> payment terms. Invoices will be automatically paid on the due date using the payment method on file.
            </SubSection>

            <SubSection title="Paper Check Payments">
              While electronic payment is required for recurring billing, any paper checks received will incur a <strong>${checkFee.toFixed(0)} administrative processing and handling fee</strong>.
            </SubSection>

            {ccSurcharge > 0 && (
              <SubSection title="Credit Card Payments">
                A <strong>{(ccSurcharge * 100).toFixed(0)}% surcharge</strong> applies to all credit card transactions. ACH/EFT is the recommended payment method — no additional fees apply.
              </SubSection>
            )}

            <SubSection title="Purchase Orders">
              If a purchase order is required, please submit it to{' '}
              <a href="mailto:billing@ferrumit.com" style={{ color:'#2563eb' }}>billing@ferrumit.com</a> prior to invoicing.
            </SubSection>
          </Section>

          {/* Setup Services Fee */}
          <Section title="Setup Services Fee">
            A one-time setup, configuration, and installation fee of <strong>{fmt$0(effectiveOnb)}</strong> is due at the start of the agreement and will be billed as specified in this Quote.
          </Section>

          {/* Declined or Returned Payments */}
          <Section title="Declined or Returned Payments">
            Any declined or returned payments may incur a <strong>${returnedFee} administrative fee</strong>.
          </Section>

          {/* Hardware, Software, Licensing */}
          <Section title="Hardware, Software, Licensing & Third-Party Services">
            All sales of hardware, software, licensing, and third-party services are final. Please review and verify all orders prior to submission, as returns or refunds are not available.
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#0f1e3c', marginBottom:6, paddingBottom:4, borderBottom:'1px solid #e5e7eb' }}>{title}</div>
      <div style={{ fontSize:11, color:'#374151', lineHeight:1.7 }}>{children}</div>
    </div>
  );
}
function SubSection({ title, children }) {
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:2 }}>{title}</div>
      <div style={{ fontSize:11, color:'#6b7280', lineHeight:1.6 }}>{children}</div>
    </div>
  );
}

const TH = { padding:'9px 12px', fontSize:10, fontWeight:700, color:'white', textAlign:'left', textTransform:'uppercase', letterSpacing:'.04em' };
const TD = { padding:'10px 12px', fontSize:11, color:'#374151', verticalAlign:'top' };

function buildScheduleRows({ contractTerm, baseMRR, baseOnboarding, effectiveOnb, obIncentive, mode }) {
  // Kept for any future export use
  return [];
}

// FerrumIT Voice Pricing Engine
// Handles Hosted Seats, Hybrid Hosting, and SIP Trunking quote types

// ─── 3CX LICENSE TIERS ───────────────────────────────────────────────────────
export const CX_TIERS = [
  { id: 'pro_8',   label: '3CX Pro — 8 Paths',   paths: 8,  ext_min: 1,   ext_max: 40,  annual_cost: 395,  type: 'pro' },
  { id: 'pro_16',  label: '3CX Pro — 16 Paths',  paths: 16, ext_min: 41,  ext_max: 80,  annual_cost: 795,  type: 'pro' },
  { id: 'pro_24',  label: '3CX Pro — 24 Paths',  paths: 24, ext_min: 81,  ext_max: 120, annual_cost: 1095, type: 'pro' },
  { id: 'ent_8',   label: '3CX Enterprise — 8 Paths',  paths: 8,  ext_min: 1,   ext_max: 40,  annual_cost: 575,  type: 'enterprise' },
  { id: 'ent_16',  label: '3CX Enterprise — 16 Paths', paths: 16, ext_min: 41,  ext_max: 80,  annual_cost: 1095, type: 'enterprise' },
  { id: 'ent_24',  label: '3CX Enterprise — 24 Paths', paths: 24, ext_min: 81,  ext_max: 120, annual_cost: 1495, type: 'enterprise' },
];

export function getRecommendedTier(seats, licenseType) {
  return CX_TIERS.find(t => t.type === licenseType && seats <= t.ext_max) || CX_TIERS.filter(t => t.type === licenseType).slice(-1)[0];
}

// ─── FAX PACKAGES ────────────────────────────────────────────────────────────
export const FAX_PACKAGES = {
  email_only: { label: 'Email-Only Fax',         price: 9.95,   users: 1,   pages: null, dids: 0, overage_page: null, extra_did: null, extra_user: null, desc: 'Fax to email only — no portal, no DID' },
  solo:       { label: 'Virtual Fax — Solo',      price: 12.00,  users: 1,   pages: 50,   dids: 1, overage_page: 0.10, extra_did: null, extra_user: null, desc: '1 user · 50 pages/mo · 1 DID · $0.10/page overage' },
  team:       { label: 'Virtual Fax — Team',      price: 29.00,  users: 5,   pages: 500,  dids: 1, overage_page: 0.08, extra_did: null, extra_user: null, desc: '5 users · 500 pages/mo · 1 DID · $0.08/page overage' },
  business:   { label: 'Virtual Fax — Business',  price: 59.00,  users: 15,  pages: 1000, dids: 1, overage_page: 0.06, extra_did: 3.00, extra_user: 3.00, desc: '15 users · 1,000 pages/mo · 1 DID + $3/extra DID or user' },
  infinity:   { label: 'Virtual Fax — Infinity',  price: 119.00, users: 50,  pages: 2500, dids: 1, overage_page: 0.05, extra_did: 2.00, extra_user: 2.00, desc: '50 users · 2,500 pages/mo · 1 DID + $2/extra DID or user' },
};

// ─── ATA MODELS ─────────────────────────────────────────────────────────────
// Hardware + monthly fee are separate line items
export const ATA_MODELS = [
  { id: 'ht802',   label: 'Grandstream HT802',  hardware_nrc: 65,   monthly: 15.00, ports: 2, desc: '2 FXS ports — standard analog fax/phone adapter' },
  { id: 'ht812',   label: 'Grandstream HT812',  hardware_nrc: 95,   monthly: 15.00, ports: 2, desc: '2 FXS ports — business grade with gigabit ethernet' },
  { id: 'ht814',   label: 'Grandstream HT814',  hardware_nrc: 135,  monthly: 15.00, ports: 4, desc: '4 FXS ports — multi-line analog adapter' },
  { id: 'ht818',   label: 'Grandstream HT818',  hardware_nrc: 195,  monthly: 15.00, ports: 8, desc: '8 FXS ports — high-density analog gateway' },
  { id: 'custom',  label: 'Other / BYOD ATA',   hardware_nrc: 0,    monthly: 15.00, ports: 1, desc: 'Client-supplied ATA — monthly service fee only' },
];

export function suggestFaxPackage(users, dids) {
  if (!users && !dids) return null;
  const u = parseInt(users) || 0;
  const d = parseInt(dids)  || 0;
  if (u <= 1 && d <= 1) return 'solo';
  if (u <= 5 && d <= 1) return 'team';
  if (u <= 15)          return 'business';
  return 'infinity';
}

// ─── YEALINK HARDWARE ────────────────────────────────────────────────────────
export const YEALINK_MODELS = [
  { id: 'T33G', label: 'Yealink T33G',  monthly: 6,  nrc: 169, desc: 'Entry level color screen' },
  { id: 'T43U', label: 'Yealink T43U', monthly: 8,  nrc: 179, desc: 'Mid-range USB expansion' },
  { id: 'T46U', label: 'Yealink T46U', monthly: 10, nrc: 269, desc: 'Executive color touchscreen' },
  { id: 'T48U', label: 'Yealink T48U', monthly: 13, nrc: 269, desc: 'Executive large touchscreen' },
  { id: 'T57W', label: 'Yealink T57W', monthly: 15, nrc: 329, desc: 'Flagship large color touchscreen' },
  { id: 'W60B', label: 'Yealink W60B', monthly: 8,  nrc: 189, desc: 'DECT cordless base + 1 handset' },
];

// BYOH — bring your own handset — supported 3CX-compatible devices
export const BYOH_NOTE = 'Client-owned devices must be supported by 3CX. Ferrum will wipe and register each device at the applicable per-handset fee.';

// ─── VOICE PRICING ENGINE ─────────────────────────────────────────────────────
export function calcVoice(v, settings) {
  const s = settings || {};
  const taxRate  = parseFloat(s.voice_tax_estimate || 0.25);
  const hosting  = parseFloat(s.voice_hosting_cost || 24);   // AWS Lightsail base
  const supportBundle = parseFloat(s.voice_support_bundle || 295); // hosting + support monthly
  const sipRate  = parseFloat(s.sip_channel_rate || 19.95);
  const didRate  = parseFloat(s.voice_did_rate || 1.50);
  const tfRate   = parseFloat(s.voice_tollfree_rate || 5.00);
  const smsAddOn = parseFloat(s.voice_sms_did_addon || 1.25);
  const e911Rate = parseFloat(s.voice_e911_rate || 2.50);
  const portFee  = parseFloat(s.voice_port_fee || 25.00);
  const smsReg   = parseFloat(s.voice_sms_reg_fee || 65.00);
  const smsCamp  = parseFloat(s.voice_sms_campaign_fee || 15.00);
  const progFee  = parseFloat(s.voice_programming_fee || 25.00);

  let mrr = 0, nrc = 0, costMrr = 0;
  const lines = [];

  // ── HOSTED SEATS ────────────────────────────────────────────────────────────
  if (v.quoteType === 'hosted') {
    const seats     = v.seats || 0;
    const seatPrice = parseFloat(v.seatPrice || 0);
    const seatCost  = parseFloat(v.seatCost  || 0);
    const seatMRR   = seats * seatPrice;
    const seatCostMRR = seats * seatCost;
    if (seatMRR > 0) {
      lines.push({ label: `${v.licenseType === 'enterprise' ? 'Enterprise' : 'Pro'} Seats (${seats} × $${seatPrice})`, mrr: seatMRR, cost: seatCostMRR, section: 'seats' });
      mrr += seatMRR; costMrr += seatCostMRR;
    }

    // Free devices — $0 line items for transparency
    const freeDevices = [
      v.commonAreaPhones > 0 && { label: `Common Area Phone${v.commonAreaPhones > 1 ? 's' : ''} (${v.commonAreaPhones} included)`, mrr: 0, cost: 0, section: 'devices', note: 'Included' },
      v.voicemailOnly   > 0 && { label: `Voicemail-Only Extensions (${v.voicemailOnly})`,   mrr: 0, cost: 0, section: 'devices', note: 'No charge' },
      v.doorPhones      > 0 && { label: `Door Phones (${v.doorPhones})`,                     mrr: 0, cost: 0, section: 'devices', note: 'No charge' },
      v.pagingDevices   > 0 && { label: `Paging Devices (${v.pagingDevices})`,               mrr: 0, cost: 0, section: 'devices', note: 'No charge' },
      v.specialRingers  > 0 && { label: `Special Ringers (${v.specialRingers})`,             mrr: 0, cost: 0, section: 'devices', note: 'No charge' },
    ].filter(Boolean);
    lines.push(...freeDevices);

    // Crossover analysis
    const hybridCost = calcHybridMRR(seats, v.licenseType || 'pro', v.isManagedIT, supportBundle, hosting, sipRate, v.sipChannels || Math.ceil(seats * 0.3), s);
    const crossoverSavings = seatMRR - hybridCost.totalMRR;

  }

  // ── HYBRID HOSTING ───────────────────────────────────────────────────────────
  if (v.quoteType === 'hybrid') {
    const tier = CX_TIERS.find(t => t.id === v.cxTierId);
    if (tier) {
      const monthlyLicense = tier.annual_cost / 12;
      const licenseMRR = v.clientPaysMonthly ? monthlyLicense : 0;
      const licenseNRC = v.clientPaysMonthly ? 0 : tier.annual_cost;
      if (v.clientPaysMonthly) {
        lines.push({ label: `${tier.label} License (amortized monthly)`, mrr: licenseMRR, cost: tier.annual_cost / 12, section: 'hybrid' });
        mrr += licenseMRR; costMrr += tier.annual_cost / 12;
      } else {
        lines.push({ label: `${tier.label} License (annual upfront)`, mrr: 0, nrc: tier.annual_cost, cost: tier.annual_cost, section: 'hybrid' });
        nrc += tier.annual_cost;
      }
    }

    // Hosting + support bundle
    if (!v.isManagedIT) {
      lines.push({ label: 'Hosted PBX — Hosting & Support', mrr: supportBundle, cost: hosting, section: 'hybrid' });
      mrr += supportBundle; costMrr += hosting;
    } else {
      lines.push({ label: 'Hosted PBX — Hosting Only (Managed IT client)', mrr: parseFloat(s.voice_hosting_sell || 105), cost: hosting, section: 'hybrid' });
      mrr += parseFloat(s.voice_hosting_sell || 105); costMrr += hosting;
    }

    // Larger instance
    if (v.largerInstance) {
      const instanceUpgrade = parseFloat(s.voice_instance_upgrade || 48);
      lines.push({ label: 'Enhanced VM Instance (API/reporting integrations)', mrr: instanceUpgrade, cost: instanceUpgrade * 0.8, section: 'hybrid' });
      mrr += instanceUpgrade; costMrr += instanceUpgrade * 0.8;
    }
  }

  // ── SIP TRUNKING (both hosted and SIP-only) ───────────────────────────────
  const channels = parseInt(v.sipChannels || 0);
  if (channels > 0) {
    const sipMRR  = channels * sipRate;
    const sipCost = channels * parseFloat(s.sip_channel_cost || 8.00);
    lines.push({ label: `SIP Trunking (${channels} concurrent paths × $${sipRate})`, mrr: sipMRR, cost: sipCost, section: 'sip' });
    mrr += sipMRR; costMrr += sipCost;
  }

  // ── NUMBERS & DIDs ─────────────────────────────────────────────────────────
  const localDIDs = parseInt(v.localDIDs || 0);
  if (localDIDs > 0) {
    const didMRR = localDIDs * didRate;
    lines.push({ label: `Local DID Numbers w/ CNAM (${localDIDs} × $${didRate})`, mrr: didMRR, cost: localDIDs * 0.50, section: 'numbers' });
    mrr += didMRR; costMrr += localDIDs * 0.50;
  }
  const smsDIDs = parseInt(v.smsDIDs || 0);
  if (smsDIDs > 0) {
    const smsDIDMRR = smsDIDs * smsAddOn;
    lines.push({ label: `SMS/MMS Enabled DIDs (${smsDIDs} × $${smsAddOn} add-on)`, mrr: smsDIDMRR, cost: smsDIDs * 0.40, section: 'numbers' });
    mrr += smsDIDMRR; costMrr += smsDIDs * 0.40;
  }
  const tfNumbers = parseInt(v.tollFreeNumbers || 0);
  if (tfNumbers > 0) {
    const tfMRR = tfNumbers * tfRate;
    lines.push({ label: `Toll-Free Numbers (${tfNumbers} × $${tfRate})`, mrr: tfMRR, cost: tfNumbers * 1.50, section: 'numbers' });
    mrr += tfMRR; costMrr += tfNumbers * 1.50;
  }
  if (v.tollFreePerMin) {
    const tfpm = Math.max(0.019, parseFloat(v.tollFreePerMinRate ?? 0.05));
    lines.push({ label: `Toll-Free Usage — $${tfpm.toFixed(3)}/min (metered)`, mrr: 0, cost: 0, section: 'numbers', note: `$${tfpm.toFixed(3)}/min — billed monthly in arrears`, metered: true });
  }
  const e911DIDs = parseInt(v.e911DIDs || 0);
  if (e911DIDs > 0) {
    const e911MRR = e911DIDs * e911Rate;
    lines.push({ label: `E911 Enabled DIDs (${e911DIDs} × $${e911Rate})`, mrr: e911MRR, cost: e911DIDs * 1.00, section: 'numbers' });
    mrr += e911MRR; costMrr += e911DIDs * 1.00;
  }

  // ── FAX ───────────────────────────────────────────────────────────────────
  // ── Virtual Fax Package ───────────────────────────────────────────────────
  if (v.faxType && v.faxType !== 'none') {
    const fp = FAX_PACKAGES[v.faxType];
    if (fp) {
      const faxUsers   = parseInt(v.faxUsers || 1);
      const faxDIDs    = parseInt(v.faxDIDs  || 1);
      let faxMRR = fp.price;

      // Extra users/DIDs beyond base package
      const extraUsers = fp.extra_user && faxUsers > fp.users ? (faxUsers - fp.users) * fp.extra_user : 0;
      const extraDIDs  = fp.extra_did  && faxDIDs  > fp.dids  ? (faxDIDs  - fp.dids)  * fp.extra_did  : 0;
      faxMRR += extraUsers + extraDIDs;

      lines.push({ label: fp.label, mrr: faxMRR, cost: faxMRR * 0.6, section: 'fax', desc: fp.desc });
      mrr += faxMRR; costMrr += faxMRR * 0.6;
      if (extraUsers > 0) lines.push({ label: `Fax Extra Users (${faxUsers - fp.users} × $${fp.extra_user})`, mrr: extraUsers, cost: extraUsers * 0.6, section: 'fax' });
      if (extraDIDs  > 0) lines.push({ label: `Fax Extra DIDs (${faxDIDs - fp.dids} × $${fp.extra_did})`,    mrr: extraDIDs,  cost: extraDIDs  * 0.6, section: 'fax' });
      if (fp.overage_page) lines.push({ label: 'Fax Overage Rate', mrr: 0, cost: 0, section: 'fax', note: `$${fp.overage_page}/page over ${fp.pages} pages`, metered: true });

      if (false) { // placeholder so old ATA block closes cleanly
        nrc += 0;
      }
    }
  }

  // ── CALL RECORDING ────────────────────────────────────────────────────────
  if (v.callRecording) {
    const crBase    = parseFloat(s.voice_call_recording_rate || 35);
    const crExtRate = parseFloat(s.voice_call_recording_ext_rate || 15);
    const crDays    = parseInt(v.callRecordingDays || 30);
    const extraMonths = Math.max(0, Math.round((crDays - 30) / 30));
    const crMRR = crBase + extraMonths * crExtRate;
    lines.push({ label: `Call Recording — ${crDays}-day retention`, mrr: crMRR, cost: crMRR * 0.5, section: 'addons',
      desc: crDays === 30 ? '30 days included' : `30 days base + ${extraMonths} extra month${extraMonths > 1 ? 's' : ''} storage` });
    mrr += crMRR; costMrr += crMRR * 0.5;
  }

  // ── SMS/MMS — required when smsDIDs > 0 ─────────────────────────────────
  const smsRequired = smsDIDs > 0;
  if (v.smsEnabled || smsRequired) {
    if (v.smsNewRegistration !== false) {
      lines.push({ label: '10DLC Brand Registration (one-time)', mrr: 0, nrc: smsReg, cost: smsReg, section: 'sms' });
      nrc += smsReg;
    }
    // Support smsCampaignList array (new) or legacy smsCampaigns count
    const campaignList = v.smsCampaignList || [];
    const numCampaigns = campaignList.length > 0 ? campaignList.length : parseInt(v.smsCampaigns || 1);
    if (numCampaigns > 0) {
      const campMRR = numCampaigns * smsCamp;
      lines.push({ label: `SMS Campaigns (${numCampaigns} × $${smsCamp}/mo)`, mrr: campMRR, cost: campMRR * 0.7, section: 'sms' });
      mrr += campMRR; costMrr += campMRR * 0.7;
    }
    lines.push({ label: 'SMS — $0.02/segment · MMS — $0.04/segment', mrr: 0, cost: 0, section: 'sms', note: 'Metered — billed monthly in arrears.', metered: true });
  }

  // ── HARDWARE — supports mixed models ────────────────────────────────────
  const hwItems = v.hardwareItems || (v.hardwareModel && v.hardwareQty > 0 ? [{ model: v.hardwareModel, qty: v.hardwareQty }] : []);
  if (v.hardwareType && v.hardwareType !== 'none' && hwItems.length > 0) {
    for (const item of hwItems) {
      const model = YEALINK_MODELS.find(m => m.id === item.model);
      const qty   = parseInt(item.qty || 0);
      if (!model || qty <= 0) continue;

      if (v.hardwareType === 'lease') {
        const leaseMRR = qty * model.monthly;
        lines.push({ label: `${model.label} — Evergreen Lease (${qty} × $${model.monthly}/mo)`, mrr: leaseMRR, cost: leaseMRR * 0.6, section: 'hardware' });
        mrr += leaseMRR; costMrr += leaseMRR * 0.6;
      } else {
        let unitPrice = model.nrc;
        let discountNote = '';
        if (v.contractTerm === 36) { unitPrice = 0; discountNote = ' — free with 36-month contract'; }
        else if (v.contractTerm === 24 && v.hardwareDiscount50) { unitPrice = model.nrc * 0.5; discountNote = ' — 50% off with 24-month contract'; }
        const hwNRC = qty * unitPrice;
        lines.push({ label: `${model.label} — Purchase (${qty} × $${unitPrice}${discountNote})`, mrr: 0, nrc: hwNRC, cost: qty * model.nrc * 0.7, section: 'hardware' });
        nrc += hwNRC;
      }
    }
    // Shipping note — billed at end of implementation at current UPS rate
    if (v.hardwareType === 'purchase' && hwItems.reduce((s,i) => s + parseInt(i.qty||0),0) > 0) {
      lines.push({ label: 'Shipping — billed at end of implementation at then-current UPS rates', mrr: 0, nrc: 0, cost: 0, section: 'hardware', note: 'TBD' });
    }
  }

  // ── BYOH — bring your own handset ────────────────────────────────────────
  const byohItems = v.byohItems || [];
  const byohFee   = parseFloat(s.voice_byoh_fee || 20);
  if (byohItems.length > 0) {
    const totalByoh = byohItems.reduce((sum, i) => sum + parseInt(i.qty||0), 0);
    if (totalByoh > 0) {
      const byohNRC = totalByoh * byohFee;
      for (const item of byohItems) {
        const qty = parseInt(item.qty||0);
        if (qty <= 0) continue;
        lines.push({ label: `BYOH — ${item.model || 'Client device'} (${qty} × wipe & register)`, mrr: 0, nrc: qty * byohFee, cost: qty * byohFee * 0.3, section: 'hardware' });
        nrc += qty * byohFee;
      }
    }
  }

  // ── PROGRAMMING FEE ────────────────────────────────────────────────────────
  const programmableSeats = v.seats || 0;
  if (programmableSeats > 0 && !v.waiveProgrammingFee) {
    const pf = programmableSeats * progFee;
    lines.push({ label: `Programming & Configuration (${programmableSeats} seats × $${progFee})`, mrr: 0, nrc: pf, cost: pf * 0.4, section: 'onetime' });
    nrc += pf;
  }

  // ── NUMBER PORTING ─────────────────────────────────────────────────────────
  const portQty = parseInt(v.portingNumbers || 0);
  if (portQty > 0) {
    const portNRC = portQty * portFee;
    lines.push({ label: `Number Porting (${portQty} × $${portFee})`, mrr: 0, nrc: portNRC, cost: portNRC * 0.2, section: 'onetime' });
    nrc += portNRC;
  }

  // ── BUNDLE DISCOUNT ────────────────────────────────────────────────────────
  let bundleDiscount = 0;
  if (v.isManagedIT && mrr > 0) {
    const discRate = parseFloat(s.voice_bundle_discount || 0.10);
    bundleDiscount = mrr * discRate;
    if (bundleDiscount > 0) {
      lines.push({ label: `Bundle Discount — Managed IT Client (${Math.round(discRate * 100)}% off voice MRR)`, mrr: -bundleDiscount, cost: 0, section: 'discount' });
    }
  }

  const finalMRR  = mrr - bundleDiscount;
  const totalCost = costMrr;
  const gm        = finalMRR > 0 ? 1 - totalCost / finalMRR : 0;
  const estTax    = finalMRR * taxRate;

  return { lines, mrr, bundleDiscount, finalMRR, nrc, costMrr, totalCost, gm, estTax, taxRate };
}

// Calc what hybrid would cost for crossover comparison
export function calcHybridMRR(seats, licenseType, isManagedIT, supportBundle, hosting, sipRate, channels, s) {
  const tier      = getRecommendedTier(seats, licenseType);
  const licMonthly = tier.annual_cost / 12;
  const hostSell   = isManagedIT ? parseFloat(s?.voice_hosting_sell || 105) : supportBundle;
  const sipMRR     = channels * sipRate;
  return { totalMRR: licMonthly + hostSell + sipMRR, tier, licMonthly, hostSell, sipMRR };
}

// ─── BUNDLE DISCOUNT LOGIC ────────────────────────────────────────────────────
// contractTerm: 12 | 24 | 36
// itBaseMRR: wB+uB+sB+lB+tB+vB only — no add-ons, no uplifts
// voiceMRR: before discount
export function calcBundleDiscount(contractTerm, itBaseMRR, voiceMRR) {
  const TIERS = { 12: 0.05, 24: 0.10, 36: 0.15 };
  const rate = TIERS[contractTerm] || 0;
  const freePhones = contractTerm === 36 && itBaseMRR >= 750;
  const voiceDiscount = voiceMRR * rate;
  return { rate, voiceDiscount, freePhones, qualifies: rate > 0 };
}

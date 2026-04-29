// FerrumIT Voice Pricing Engine
// Handles Hosted Seats, Hybrid Hosting, and SIP Trunking quote types

import { supabase } from './supabase';

// ─── VOICE HARDWARE CATALOG (DB-backed since v3.5.23) ────────────────────────
// Loads phones and ATAs from the voice_hardware table at runtime.
// Phones (Yealink etc.): rows where catalog_id IS NOT NULL AND
//                        (lease_eligible OR purchase_eligible) AND
//                        hardware_type IN ('phone','dect')
// ATAs:                  rows where catalog_id IS NOT NULL AND
//                        purchase_eligible AND hardware_type='ata'
//
// Returns objects shaped like the old YEALINK_MODELS / ATA_MODELS constants
// so existing consumers keep working unchanged after this field-name normalization:
//   catalog_id        → id
//   short_label       → label
//   short_description → desc
//   monthly_lease     → monthly      (for phones)
//   purchase_price    → nrc          (for phones)
//   monthly_lease     → monthly      (for ATAs — null in DB, defaults to 15.00 below)
//   purchase_price    → hardware_nrc (for ATAs)
//   ports             → ports
//
// Falls back to the hardcoded constants below if the fetch fails — safety net
// that v3.5.24 will remove once the DB-backed flow has proven stable.
export async function loadVoiceHardwareCatalog() {
  try {
    const { data, error } = await supabase
      .from('voice_hardware')
      .select('catalog_id, short_label, short_description, hardware_type, monthly_lease, purchase_price, ports, lease_eligible, purchase_eligible, sort_order')
      .eq('active', true)
      .not('catalog_id', 'is', null)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('voice_hardware catalog returned empty, falling back to hardcoded constants');
      return { yealink: YEALINK_MODELS, atas: ATA_MODELS, _fallback: true };
    }

    const yealink = [];
    const atas = [];
    for (const row of data) {
      const isAta = row.hardware_type === 'ata' || row.hardware_type === 'gateway';
      const obj = {
        id:    row.catalog_id,
        label: row.short_label || row.catalog_id,
        desc:  row.short_description || '',
        sort:  row.sort_order ?? 100,
      };

      if (isAta) {
        // ATA shape — older constants used hardware_nrc + flat $15/mo service fee.
        // We keep the $15 default for the per-port voice service fee (it's a service
        // charge, not a hardware lease — DB only tracks the hardware purchase price).
        atas.push({
          ...obj,
          hardware_nrc: row.purchase_price != null ? Number(row.purchase_price) : 0,
          monthly:      15.00,
          ports:        row.ports || 1,
        });
      } else if (row.lease_eligible || row.purchase_eligible) {
        yealink.push({
          ...obj,
          monthly: row.monthly_lease  != null ? Number(row.monthly_lease)  : null,
          nrc:     row.purchase_price != null ? Number(row.purchase_price) : null,
          // Carry eligibility through so dropdowns can hide non-eligible options
          lease_eligible:    !!row.lease_eligible,
          purchase_eligible: !!row.purchase_eligible,
        });
      }
    }

    yealink.sort((a, b) => a.sort - b.sort);
    atas.sort((a, b) => a.sort - b.sort);

    return { yealink, atas, _fallback: false };
  } catch (err) {
    console.error('loadVoiceHardwareCatalog failed:', err);
    return { yealink: YEALINK_MODELS, atas: ATA_MODELS, _fallback: true };
  }
}

// ─── 3CX LICENSE TIERS ───────────────────────────────────────────────────────
// Base tiers — costs are overridable via pricing_settings
const CX_TIERS_BASE = [
  { id: 'pro_8',   label: '3CX Pro — 8 Paths',          paths: 8,  ext_min: 1,   ext_max: 40,  annual_cost: 395,  type: 'pro' },
  { id: 'pro_16',  label: '3CX Pro — 16 Paths',         paths: 16, ext_min: 41,  ext_max: 80,  annual_cost: 795,  type: 'pro' },
  { id: 'pro_24',  label: '3CX Pro — 24 Paths',         paths: 24, ext_min: 81,  ext_max: 120, annual_cost: 1095, type: 'pro' },
  { id: 'ent_8',   label: '3CX Enterprise — 8 Paths',   paths: 8,  ext_min: 1,   ext_max: 40,  annual_cost: 575,  type: 'enterprise' },
  { id: 'ent_16',  label: '3CX Enterprise — 16 Paths',  paths: 16, ext_min: 41,  ext_max: 80,  annual_cost: 1095, type: 'enterprise' },
  { id: 'ent_24',  label: '3CX Enterprise — 24 Paths',  paths: 24, ext_min: 81,  ext_max: 120, annual_cost: 1495, type: 'enterprise' },
];

// Returns tiers with costs overridden from pricing_settings when available
export function getCXTiers(settings) {
  const s = settings || {};
  return CX_TIERS_BASE.map(t => ({
    ...t,
    annual_cost: parseFloat(s[`cx_license_${t.id}`] || t.annual_cost),
  }));
}

// Static export for components that don't have settings yet
export const CX_TIERS = CX_TIERS_BASE;

// Lightsail instance tiers by seat count
export function getLightsailCost(seats, settings) {
  const s = settings || {};
  if (seats <= 20)  return parseFloat(s.voice_lightsail_small  || 24);
  if (seats <= 50)  return parseFloat(s.voice_lightsail_medium || 48);
  return parseFloat(s.voice_lightsail_large || 96);
}

export function getLightsailLabel(seats, settings) {
  const s = settings || {};
  if (seats <= 20)  return `Lightsail Small (≤20 seats) — $${parseFloat(s.voice_lightsail_small||24)}/mo`;
  if (seats <= 50)  return `Lightsail Medium (≤50 seats) — $${parseFloat(s.voice_lightsail_medium||48)}/mo`;
  return `Lightsail Large (50+ seats) — $${parseFloat(s.voice_lightsail_large||96)}/mo`;
}

export function getRecommendedTier(seats, licenseType, settings) {
  const tiers = getCXTiers(settings);
  return tiers.find(t => t.type === licenseType && seats <= t.ext_max) || tiers.filter(t => t.type === licenseType).slice(-1)[0];
}

// ─── FAX PACKAGES ────────────────────────────────────────────────────────────
// Fallback constant — used when DB rows aren't available (initial mount, error, etc.).
// Cost values default to 0 here so margins reflect "unknown cost" rather than guessed cost.
// Real values come from voice_fax_packages table via getFaxPackages(rows).
export const FAX_PACKAGES = {
  email_only: { label: 'Email-Only Fax',         price: 9.95,   cost: 0, users: 1,   pages: null, dids: 0, overage_page: null, overage_cost: 0, extra_did: null, extra_did_cost: 0, extra_user: null, extra_user_cost: 0, desc: 'Fax to email only — no portal, no DID' },
  solo:       { label: 'Virtual Fax — Solo',      price: 12.00,  cost: 0, users: 1,   pages: 50,   dids: 1, overage_page: 0.10, overage_cost: 0, extra_did: null, extra_did_cost: 0, extra_user: null, extra_user_cost: 0, desc: '1 user · 50 pages/mo · 1 DID · $0.10/page overage' },
  team:       { label: 'Virtual Fax — Team',      price: 29.00,  cost: 0, users: 5,   pages: 500,  dids: 1, overage_page: 0.08, overage_cost: 0, extra_did: null, extra_did_cost: 0, extra_user: null, extra_user_cost: 0, desc: '5 users · 500 pages/mo · 1 DID · $0.08/page overage' },
  business:   { label: 'Virtual Fax — Business',  price: 59.00,  cost: 0, users: 15,  pages: 1000, dids: 1, overage_page: 0.06, overage_cost: 0, extra_did: 3.00, extra_did_cost: 0, extra_user: 3.00, extra_user_cost: 0, desc: '15 users · 1,000 pages/mo · 1 DID + $3/extra DID or user' },
  infinity:   { label: 'Virtual Fax — Infinity',  price: 119.00, cost: 0, users: 50,  pages: 2500, dids: 1, overage_page: 0.05, overage_cost: 0, extra_did: 2.00, extra_did_cost: 0, extra_user: 2.00, extra_user_cost: 0, desc: '50 users · 2,500 pages/mo · 1 DID + $2/extra DID or user' },
};

// Convert voice_fax_packages DB rows into the same shape as the FAX_PACKAGES constant,
// keyed by package_key. Falls back to the constant for any package_key not in the rows.
export function getFaxPackages(dbRows) {
  if (!Array.isArray(dbRows) || dbRows.length === 0) return FAX_PACKAGES;
  const out = {};
  for (const r of dbRows) {
    if (!r.active) continue;
    out[r.package_key] = {
      label:           r.label,
      price:           parseFloat(r.sell_mrr || 0),
      cost:            parseFloat(r.cost_mrr || 0),
      users:           parseInt(r.included_users || 1),
      pages:           r.included_pages == null ? null : parseInt(r.included_pages),
      dids:            parseInt(r.included_dids || 0),
      overage_page:    r.overage_sell_per_page == null ? null : parseFloat(r.overage_sell_per_page),
      overage_cost:    parseFloat(r.overage_cost_per_page || 0),
      extra_user:      r.extra_user_sell == null ? null : parseFloat(r.extra_user_sell),
      extra_user_cost: parseFloat(r.extra_user_cost || 0),
      extra_did:       r.extra_did_sell  == null ? null : parseFloat(r.extra_did_sell),
      extra_did_cost:  parseFloat(r.extra_did_cost  || 0),
      desc:            r.description || '',
    };
  }
  return Object.keys(out).length > 0 ? out : FAX_PACKAGES;
}

// ─── ATA MODELS (DEPRECATED — v3.5.24 will remove) ───────────────────────────
// Hardware + monthly fee are separate line items.
// As of v3.5.23, the canonical catalog lives in the voice_hardware table —
// this constant is retained only as a fallback when loadVoiceHardwareCatalog()
// fails. v3.5.24 will delete this once the DB-backed flow has proven stable.
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

// ─── YEALINK HARDWARE (DEPRECATED — v3.5.24 will remove) ─────────────────────
// As of v3.5.23, the canonical catalog lives in the voice_hardware table.
// This constant is retained only as a fallback when loadVoiceHardwareCatalog()
// fails. v3.5.24 will delete this once the DB-backed flow has proven stable.
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
// `faxPackages` is optional — pass DB rows from voice_fax_packages for accurate cost.
// When omitted, falls back to the FAX_PACKAGES constant ($0 cost = unknown margin).
// `catalog` is optional (added v3.5.23) — pass the result of loadVoiceHardwareCatalog()
// from the calling page. When omitted, hardware lookups fall back to the
// deprecated YEALINK_MODELS constant. v3.5.24 will remove the fallback.
export function calcVoice(v, settings, faxPackages, catalog) {
  const yealinkCatalog = catalog?.yealink || YEALINK_MODELS;
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
    const seatMRR   = seats * seatPrice;

    // 3CX license cost — amortized monthly from annual cost for appropriate tier
    const cxTiers   = getCXTiers(s);
    const licType   = v.licenseType || 'pro';
    const cxTier    = cxTiers.find(t => t.type === licType && seats <= t.ext_max)
                   || cxTiers.filter(t => t.type === licType).slice(-1)[0];
    const cxMonthly = cxTier ? cxTier.annual_cost / 12 : 0;

    // Lightsail hosting cost (instance scaled by seat count)
    const lsCost    = getLightsailCost(seats, s);

    // Total Ferrum cost for hosted voice
    const hostedCostMRR = cxMonthly + lsCost;
    const seatCostMRR   = hostedCostMRR; // total cost to deliver hosted voice

    if (seatMRR > 0) {
      lines.push({ label: `${licType === 'enterprise' ? '3CX Enterprise' : '3CX Pro'} Hosted Seats (${seats} × $${seatPrice})`, mrr: seatMRR, cost: seatCostMRR, section: 'seats' });
      mrr += seatMRR; costMrr += seatCostMRR;
    }

    // Show cost breakdown as sub-lines (cost only, no MRR)
    if (cxTier) {
      lines.push({ label: `↳ ${cxTier.label} License ($${cxTier.annual_cost}/yr ÷ 12)`, mrr: 0, cost: cxMonthly, section: 'seats', costOnly: true,
        note: `$${cxMonthly.toFixed(2)}/mo amortized · renews annually` });
    }
    lines.push({ label: `↳ ${getLightsailLabel(seats, s)}`, mrr: 0, cost: lsCost, section: 'seats', costOnly: true });

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
    const faxCatalog = getFaxPackages(faxPackages);
    const fp = faxCatalog[v.faxType];
    if (fp) {
      const faxUsers   = parseInt(v.faxUsers || 1);
      const faxDIDs    = parseInt(v.faxDIDs  || 1);
      let faxMRR  = fp.price;
      let faxCost = fp.cost || 0;

      // Extra users/DIDs beyond base package — sell + cost tracked separately
      const extraUserCount = fp.extra_user && faxUsers > fp.users ? (faxUsers - fp.users) : 0;
      const extraDIDCount  = fp.extra_did  && faxDIDs  > fp.dids  ? (faxDIDs  - fp.dids)  : 0;
      const extraUsersSell = extraUserCount * (fp.extra_user || 0);
      const extraDIDsSell  = extraDIDCount  * (fp.extra_did  || 0);
      const extraUsersCost = extraUserCount * (fp.extra_user_cost || 0);
      const extraDIDsCost  = extraDIDCount  * (fp.extra_did_cost  || 0);
      faxMRR  += extraUsersSell + extraDIDsSell;
      faxCost += extraUsersCost + extraDIDsCost;

      lines.push({ label: fp.label, mrr: fp.price, cost: fp.cost || 0, section: 'fax', desc: fp.desc });
      mrr += fp.price; costMrr += (fp.cost || 0);
      if (extraUsersSell > 0) {
        lines.push({ label: `Fax Extra Users (${extraUserCount} × $${fp.extra_user})`, mrr: extraUsersSell, cost: extraUsersCost, section: 'fax' });
        mrr += extraUsersSell; costMrr += extraUsersCost;
      }
      if (extraDIDsSell > 0) {
        lines.push({ label: `Fax Extra DIDs (${extraDIDCount} × $${fp.extra_did})`, mrr: extraDIDsSell, cost: extraDIDsCost, section: 'fax' });
        mrr += extraDIDsSell; costMrr += extraDIDsCost;
      }
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
      const model = yealinkCatalog.find(m => m.id === item.model);
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

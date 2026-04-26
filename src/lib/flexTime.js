// flexTime.js — Flex Time Block pricing logic

export const FLEX_BLOCKS = [
  { hours: 5,  label: 'Starter Block',    discountKey: 'flex_discount_5hr',  defaultDiscount: 0.10 },
  { hours: 10, label: 'Standard Block',   discountKey: 'flex_discount_10hr', defaultDiscount: 0.15 },
  { hours: 20, label: 'Extended Block',   discountKey: 'flex_discount_20hr', defaultDiscount: 0.20 },
  { hours: 30, label: 'Pro Block',        discountKey: 'flex_discount_30hr', defaultDiscount: 0.22 },
  { hours: 40, label: 'Enterprise Block', discountKey: 'flex_discount_40hr', defaultDiscount: 0.25 },
];

// Round to nearest $0.50 for clean pricing
function roundRate(n) { return Math.round(n * 2) / 2; }

// Calculate price for a flex time block
// remoteRate = market-adjusted hourly T&M rate
// settings   = pricing_settings object
export function calcFlexBlock(hours, remoteRate, settings) {
  const block = FLEX_BLOCKS.find(b => b.hours === hours);
  if (!block) return null;

  const discount   = parseFloat(settings?.[block.discountKey] ?? block.defaultDiscount);
  const fullPrice  = remoteRate * hours;
  const blockPrice = roundRate(fullPrice * (1 - discount));
  const savings    = fullPrice - blockPrice;
  const ratePerHr  = roundRate(blockPrice / hours);

  return {
    hours,
    label:       block.label,
    discount,
    discountPct: Math.round(discount * 100),
    fullPrice:   Math.round(fullPrice * 100) / 100,
    blockPrice:  Math.round(blockPrice * 100) / 100,
    savings:     Math.round(savings * 100) / 100,
    ratePerHr,
  };
}

// Calculate all blocks at once
export function calcAllFlexBlocks(remoteRate, settings) {
  return FLEX_BLOCKS.map(b => calcFlexBlock(b.hours, remoteRate, settings));
}

// Tier 3 / Senior Technical rate
export function calcTier3Rate(remoteRate, settings) {
  const override = parseFloat(settings?.tier3_rate_override || '');
  if (!isNaN(override) && override > 0) return override;
  const mult = parseFloat(settings?.tier3_rate_multiplier || 1.75);
  return roundRate(remoteRate * mult);
}

// No-rollover boilerplate for managed IT flex time
export const FLEX_MANAGED_TERMS = `Allotted time that is not utilized by Customer during one calendar month does not carry over to later calendar months and no refund will be made to Customer for unused allotted hours. Unused allotted hours cannot be redeemed for cash or used to discount hardware or software purchases, or for any other purpose. Time refreshes at the start of each calendar month.`;

// FlexIT On-Demand block terms
export const FLEX_ONDEMAND_TERMS = `Pre-purchased block hours are valid for 12 months from the date of purchase. Blocks may be refilled at any time at the original agreed-upon rate. If the block is exhausted or expires and the Customer does not refill within 30 days of depletion or expiration, a new quote will be required at the then-current published rates. Hours are for Tier 1/2 labor (remote and onsite support, SME, specialist) only. Tier 3 / Senior Technical engagements are bid separately and are not eligible for block time pooling.`;

// Tier 3 exclusion language
export const TIER3_EXCLUSION = `The following work types are outside the scope of Flex Time blocks and are bid at a separate Tier 3 rate: network design and engineering, server projects and installations, firewall deployment, SAN deployment and design, email migration, disaster recovery planning and execution, software engineering, and network/server security audits.`;

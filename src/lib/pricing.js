// FerrumIT Pricing Engine
// Pure functions — no Supabase imports. Takes DB-loaded config as params.

// ─── ZIP → MARKET TIER ───────────────────────────────────────────────────────
const MAJOR = new Set([100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,900,901,902,903,904,905,906,907,908,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,600,601,602,603,604,605,606,607,608,750,751,752,753,754,755,756,757,758,759,760,761,762,763,764,765,766,767,770,771,772,773,774,775,776,777,200,201,202,203,204,205,206,207,208,209,190,191,192,193,194,195,196,197,198,199,330,331,332,333,334,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,20,21,22,23,24,25,26,27,28,29,980,981,982,983,984,985,986,987,988,989,850,851,852,853,854,855,856,857,858,859,860,861,862,863,864,865,940,941,942,943,944,945,946,947,948,949,950,951,952,953,954,955,956,957,958,959,800,801,802,803,804,805,806,807,808,809,810,811,812,813,814,815,816,480,481,482,483,484,485,486,487,488,489,550,551,552,553,554,555,210,211,212,213,214,215,216,217,218,219,630,631,632,633,634,635,636,637,638,639,970,971,972,973,974,975,976,977,978,979,889,890,891,892,893,894,895,335,336,337,338,327,328,329,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,450,451,452,453,454,455,456,457,458,640,641,642,643,644,645,646,647,648,649,460,461,462,463,464,465,466,467,468,469,430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,780,781,782,783,784,785,786,787,788,789,280,281,282,283,284,285,286,287,288,289,370,371,372,373,374,375,376,320,321,322,323,324,325,326,230,231,232,233,234,235,236,237,238,239,275,276,277,278,279,60,61,62,63,64,65,66,67,68,69,700,701,702,703,704,840,841,842,843,844,845,846,847,380,381,382,383,384,385,386,387,388,389,400,401,402,403,404,405,406,407,408,409]);
const MID  = new Set([740,741,742,743,744,745,746,747,748,749,350,351,352,353,354,355,356,357,358,359,870,871,872,873,874,875,876,877,878,879,880,881,882,883,884,885,795,796,797,798,799,680,681,682,683,684,685,686,687,688,689,500,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,517,518,519,520,720,721,722,723,724,725,726,727,728,729,490,491,492,493,494,495,496,497,498,499,707,708,710,711,712,713,714,290,291,292,293,294,295,296,297,298,299,990,991,992,993,994,836,837,838,839,535,536,537,538,539,377,378,379,670,671,672,673,674,675,676,677,678,679,936,937,932,933,934,935,130,131,132,133,134,135,136,137,138,139,14,15,16,17,18,19,120,121,122,123,124,125,126,127,128,129,655,656,657,658,659,488,489,283,284,285,930,931,184,185,186,187,188,189,339,170,171,172,173,174,175,176,177,178,179,846,847,467,468,469,570,571,572,573,574,580,581,582,583,584,610,611,614,615,626,627,628,629,541,542,543,556,557,558,685,686,687,688,689,664,665,666,667,668,669,776,777,783,784,793,794,790,791,792,797,820,821,822,823,824,825,826,827,828,829,830,831,894,895,967,968,969,590,591,592,597,598,577,578,585,586]);
const ZIP_NAMES = {100:"New York, NY",130:"Syracuse, NY",140:"Buffalo, NY",150:"Pittsburgh, PA",170:"Harrisburg, PA",190:"Philadelphia, PA",200:"Washington, DC",210:"Baltimore, MD",231:"Richmond, VA",20:"Boston, MA",60:"Hartford, CT",70:"Newark, NJ",280:"Charlotte, NC",275:"Raleigh, NC",300:"Atlanta, GA",327:"Orlando, FL",330:"Miami, FL",335:"Tampa, FL",350:"Birmingham, AL",370:"Nashville, TN",380:"Memphis, TN",400:"Louisville, KY",430:"Columbus, OH",440:"Cleveland, OH",450:"Cincinnati, OH",460:"Indianapolis, IN",480:"Detroit, MI",490:"Grand Rapids, MI",500:"Des Moines, IA",550:"Minneapolis, MN",600:"Chicago, IL",630:"St. Louis, MO",640:"Kansas City, MO",670:"Wichita, KS",680:"Omaha, NE",700:"New Orleans, LA",720:"Little Rock, AR",730:"Oklahoma City, OK",740:"Tulsa, OK",750:"Dallas, TX",770:"Houston, TX",780:"San Antonio, TX",786:"Austin, TX",800:"Denver, CO",836:"Boise, ID",840:"Salt Lake City, UT",850:"Phoenix, AZ",856:"Tucson, AZ",870:"Albuquerque, NM",889:"Las Vegas, NV",900:"Los Angeles, CA",919:"San Diego, CA",940:"San Francisco, CA",956:"Sacramento, CA",970:"Portland, OR",980:"Seattle, WA",990:"Spokane, WA"};

export function lookupZip(raw) {
  const z = raw.replace(/\D/g, '').slice(0, 5);
  if (z.length < 3) return null;
  const p3 = parseInt(z.slice(0, 3), 10);
  const p2 = parseInt(z.slice(0, 2), 10);
  const tier = MAJOR.has(p3) || MAJOR.has(p2) ? 'major_metro'
    : MID.has(p3) || MID.has(p2) ? 'mid_market' : 'small_market';
  return { tier, name: ZIP_NAMES[p3] || ZIP_NAMES[p2] || null, zip: z };
}

// ─── MULTIPLIER TABLES (these rarely change, keeping inline) ─────────────────
const COV_M  = { business_hours: 1.0, '24x5': 1.2, '24x7': 1.35 };
const RISK_M = { low: 1.0, medium: 1.1, high: 1.2 };
const COMP_M = { none: 1.0, moderate: 1.12, high: 1.22 };
const CPLX_M = { low: 1.0, medium: 1.08, high: 1.18 };

// ─── MAIN CALC ───────────────────────────────────────────────────────────────
export function calcQuote({ inputs, pkg, marketTier, products, settings }) {
  if (!pkg || !marketTier || !settings) return null;

  const s = settings; // shorthand — settings is a key→value map
  const mktMult = parseFloat(marketTier.labor_multiplier) || 1;

  // ── Managed IT base ──────────────────────────────────────────────────────
  const wB  = inputs.workstations * pkg.ws_rate;
  const uB  = inputs.users * pkg.user_rate;
  const sB  = inputs.servers * pkg.server_rate;
  const lB  = inputs.locations * pkg.location_rate;
  const tB  = inputs.cloudTenants * pkg.tenant_rate;
  const xv  = Math.max(inputs.vendors - pkg.included_vendors, 0);
  const vB  = xv * pkg.vendor_rate;

  const epRatio = inputs.workstations > 0 ? inputs.endpoints / inputs.workstations : 0;
  const xEp = Math.max(inputs.endpoints - inputs.workstations * 1.25, 0);
  const epRate = epRatio <= 1.75
    ? parseFloat(s.ep_uplift_moderate)
    : parseFloat(s.ep_uplift_high);
  const eB = xEp * epRate;

  const reqCovMult = COV_M[inputs.requestedCoverage] || 1;
  const pkgCovMult = COV_M[pkg.coverage] || 1;
  const covU = Math.max(reqCovMult / pkgCovMult - 1, 0) * wB;

  const itSubtotal = wB + uB + sB + lB + tB + vB + eB + covU;

  // ── Selected add-on products ──────────────────────────────────────────────
  const lineItems = [];
  let addonRevenue = 0;
  let addonCost = 0;

  for (const product of products.filter(p => inputs.selectedProducts?.includes(p.id))) {
    const qty = getQty(product, inputs);
    const revenue = qty * product.sell_price;
    const cost    = qty * product.cost_price;
    addonRevenue += revenue;
    addonCost    += cost;
    lineItems.push({
      product_id:   product.id,
      product_name: product.name,
      category:     product.category,
      qty_driver:   product.qty_driver,
      qty,
      sell_price:   product.sell_price,
      cost_price:   product.cost_price,
      revenue,
      cost
    });
  }

  const opSubtotal = itSubtotal + addonRevenue;

  // ── Composite multiplier ──────────────────────────────────────────────────
  const compMult = (RISK_M[inputs.industryRisk] || 1)
                 * (COMP_M[inputs.compliance]    || 1)
                 * (CPLX_M[inputs.complexity]    || 1);
  const riskAdjMRR = opSubtotal * compMult;

  // ── Floor + discount ──────────────────────────────────────────────────────
  const floor    = parseFloat(s.min_commitment) || 350;
  const discKey  = `contract_disc_${inputs.contractTerm}`;
  const discRate = parseFloat(s[discKey]) || 0;
  const discount = -Math.max(riskAdjMRR - floor, 0) * discRate;
  const finalMRR = Math.max(riskAdjMRR + discount, floor);

  // ── Cost model ────────────────────────────────────────────────────────────
  const toolingCost = inputs.workstations * parseFloat(s.stack_cost_per_ws)
                    + inputs.users        * parseFloat(s.stack_cost_per_user)
                    + inputs.servers      * parseFloat(s.stack_cost_per_server)
                    + inputs.cloudTenants * parseFloat(s.stack_cost_per_tenant);

  const svcHrs = inputs.users        * pkg.hrs_user
               + inputs.workstations * pkg.hrs_ws
               + inputs.servers      * pkg.hrs_server
               + inputs.locations    * pkg.hrs_location;
  const svcCost = svcHrs * parseFloat(s.burdened_hourly_rate) * mktMult;

  const totalCost = toolingCost + svcCost + addonCost;
  const impliedGM = finalMRR > 0 ? 1 - totalCost / finalMRR : 0;

  // ── Onboarding ────────────────────────────────────────────────────────────
  const obMin = parseFloat(s.onboarding_min) || 500;
  const obCalc = inputs.users        * parseFloat(s.onboarding_per_user)
               + inputs.workstations * parseFloat(s.onboarding_per_ws)
               + inputs.servers      * parseFloat(s.onboarding_per_server)
               + inputs.locations    * parseFloat(s.onboarding_per_location);
  const onboarding = Math.max(obCalc, obMin);

  // ── Package recommendation ────────────────────────────────────────────────
  let recommended = 'Business Essentials';
  if (inputs.users >= 100 || inputs.requestedCoverage === '24x7' ||
      inputs.compliance === 'high' || inputs.industryRisk === 'high' ||
      inputs.locations >= 3 || inputs.servers >= 5 || inputs.execReporting)
    recommended = 'Enterprise';
  else if (inputs.users >= 25 || inputs.requestedCoverage !== 'business_hours' ||
           inputs.compliance !== 'none' || inputs.industryRisk !== 'low' ||
           inputs.cloudTenants >= 1 || inputs.vendors > 3)
    recommended = 'Business Plus';

  return {
    // Managed IT breakdown
    wB, uB, sB, lB, tB, vB, eB, covU, itSubtotal,
    // Add-ons
    lineItems, addonRevenue,
    // Summary
    opSubtotal, compMult, riskAdjMRR, floor,
    discount, discRate, finalMRR,
    // Cost model
    toolingCost, svcHrs, svcCost, addonCost, totalCost, impliedGM,
    // Onboarding
    onboarding, obCalc, onboardingIsMinimum: obCalc < obMin,
    // Meta
    recommended, mktMult
  };
}

function getQty(product, inputs) {
  switch (product.qty_driver) {
    case 'user':        return inputs.users;
    case 'mailbox':     return inputs.users + inputs.sharedMailboxes;
    case 'workstation': return inputs.workstations;
    case 'server':      return inputs.servers;
    case 'location':    return inputs.locations;
    case 'flat':        return 1;
    case 'mixed':       return inputs.workstations; // fallback for mixed (e.g. backup overrides per-type)
    default:            return 0;
  }
}

// ─── FORMAT HELPERS ──────────────────────────────────────────────────────────
export const fmt$ = (v, d = 2) => v == null ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
      minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
export const fmt$0 = v => fmt$(v, 0);
export const fmtPct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
export const gmColor = g => g >= 0.45 ? '#166534' : g >= 0.30 ? '#92400e' : '#991b1b';
export const gmBg    = g => g >= 0.45 ? '#dcfce7' : g >= 0.30 ? '#fef3c7' : '#fee2e2';

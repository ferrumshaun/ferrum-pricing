// FerrumIT Pricing Engine
// Pure functions — no Supabase imports. Takes DB-loaded config as params.

// ─── ZIP → MARKET TIER ───────────────────────────────────────────────────────
const MAJOR = new Set([100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,900,901,902,903,904,905,906,907,908,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,600,601,602,603,604,605,606,607,608,750,751,752,753,754,755,756,757,758,759,760,761,762,763,764,765,766,767,770,771,772,773,774,775,776,777,200,201,202,203,204,205,206,207,208,209,190,191,192,193,194,195,196,197,198,199,330,331,332,333,334,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,20,21,22,23,24,25,26,27,28,29,980,981,982,983,984,985,986,987,988,989,850,851,852,853,854,855,856,857,858,859,860,861,862,863,864,865,940,941,942,943,944,945,946,947,948,949,950,951,952,953,954,955,956,957,958,959,800,801,802,803,804,805,806,807,808,809,810,811,812,813,814,815,816,480,481,482,483,484,485,486,487,488,489,550,551,552,553,554,555,210,211,212,213,214,215,216,217,218,219,630,631,632,633,634,635,636,637,638,639,970,971,972,973,974,975,976,977,978,979,889,890,891,892,893,894,895,335,336,337,338,327,328,329,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,450,451,452,453,454,455,456,457,458,640,641,642,643,644,645,646,647,648,649,460,461,462,463,464,465,466,467,468,469,430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,780,781,782,783,784,785,786,787,788,789,280,281,282,283,284,285,286,287,288,289,370,371,372,373,374,375,376,320,321,322,323,324,325,326,230,231,232,233,234,235,236,237,238,239,275,276,277,278,279,60,61,62,63,64,65,66,67,68,69,700,701,702,703,704,840,841,842,843,844,845,846,847,380,381,382,383,384,385,386,387,388,389,400,401,402,403,404,405,406,407,408,409]);
const MID  = new Set([740,741,742,743,744,745,746,747,748,749,350,351,352,353,354,355,356,357,358,359,870,871,872,873,874,875,876,877,878,879,880,881,882,883,884,885,795,796,797,798,799,680,681,682,683,684,685,686,687,688,689,500,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,517,518,519,520,720,721,722,723,724,725,726,727,728,729,490,491,492,493,494,495,496,497,498,499,707,708,710,711,712,713,714,290,291,292,293,294,295,296,297,298,299,990,991,992,993,994,836,837,838,839,535,536,537,538,539,377,378,379,670,671,672,673,674,675,676,677,678,679,936,937,932,933,934,935,130,131,132,133,134,135,136,137,138,139,14,15,16,17,18,19,120,121,122,123,124,125,126,127,128,129,655,656,657,658,659,488,489,283,284,285,930,931,184,185,186,187,188,189,339,170,171,172,173,174,175,176,177,178,179,846,847,467,468,469,570,571,572,573,574,580,581,582,583,584,610,611,614,615,626,627,628,629,541,542,543,556,557,558,685,686,687,688,689,664,665,666,667,668,669,776,777,783,784,793,794,790,791,792,797,820,821,822,823,824,825,826,827,828,829,830,831,894,895,967,968,969,590,591,592,597,598,577,578,585,586]);
const ZIP_NAMES = {
  // New York metro
  100:"New York, NY",101:"New York, NY",102:"New York, NY",103:"Staten Island, NY",
  104:"Bronx, NY",105:"Westchester, NY",106:"Westchester, NY",107:"Westchester, NY",
  108:"Westchester, NY",109:"Westchester, NY",110:"Queens, NY",111:"Queens, NY",
  112:"Brooklyn, NY",113:"Queens, NY",114:"Queens, NY",116:"Queens, NY",
  117:"Long Island, NY",118:"Long Island, NY",119:"Long Island, NY",
  // Upstate NY
  120:"Albany, NY",121:"Albany, NY",122:"Albany, NY",130:"Syracuse, NY",
  131:"Syracuse, NY",132:"Syracuse, NY",140:"Buffalo, NY",141:"Buffalo, NY",
  142:"Buffalo, NY",144:"Rochester, NY",145:"Rochester, NY",
  // PA
  150:"Pittsburgh, PA",151:"Pittsburgh, PA",152:"Pittsburgh, PA",
  170:"Harrisburg, PA",171:"Harrisburg, PA",172:"Harrisburg, PA",
  184:"Scranton, PA",185:"Scranton, PA",
  190:"Philadelphia, PA",191:"Philadelphia, PA",192:"Philadelphia, PA",
  // DC/MD/VA
  200:"Washington, DC",201:"Washington, DC",202:"Washington, DC",
  203:"Washington, DC",204:"Washington, DC",205:"Washington, DC",
  210:"Baltimore, MD",211:"Baltimore, MD",212:"Baltimore, MD",
  220:"Northern Virginia",221:"Northern Virginia",222:"Northern Virginia",
  230:"Hampton Roads, VA",231:"Richmond, VA",232:"Richmond, VA",
  // NJ
  70:"Newark, NJ",71:"Newark, NJ",72:"Trenton, NJ",73:"Trenton, NJ",
  74:"Elizabeth, NJ",75:"Princeton, NJ",76:"Atlantic City, NJ",
  77:"Long Branch, NJ",78:"Freehold, NJ",79:"New Brunswick, NJ",
  // CT — use 3-digit to avoid collision with Chicago 60x
  60:"Hartford, CT",
  // MA/RI
  20:"Boston, MA",21:"Boston, MA",22:"Boston, MA",23:"Boston, MA",
  24:"Boston, MA",25:"Cape Cod, MA",26:"Worcester, MA",27:"Worcester, MA",
  28:"Providence, RI",29:"Providence, RI",
  // NC
  275:"Raleigh, NC",276:"Raleigh, NC",277:"Raleigh, NC",
  280:"Charlotte, NC",281:"Charlotte, NC",282:"Charlotte, NC",
  // SC
  290:"Columbia, SC",291:"Columbia, SC",293:"Greenville, SC",295:"Greenville, SC",
  // GA
  300:"Atlanta, GA",301:"Atlanta, GA",302:"Atlanta, GA",303:"Atlanta, GA",
  // FL
  320:"Jacksonville, FL",321:"Daytona Beach, FL",322:"Jacksonville, FL",
  323:"Tallahassee, FL",325:"Pensacola, FL",
  327:"Orlando, FL",328:"Orlando, FL",329:"Orlando, FL",
  330:"Miami, FL",331:"Miami, FL",332:"Miami, FL",333:"Fort Lauderdale, FL",334:"West Palm Beach, FL",
  335:"Tampa, FL",336:"Tampa, FL",337:"St. Petersburg, FL",338:"Lakeland, FL",
  339:"Fort Myers, FL",
  // AL
  350:"Birmingham, AL",351:"Birmingham, AL",352:"Birmingham, AL",357:"Huntsville, AL",
  // TN
  370:"Nashville, TN",371:"Nashville, TN",372:"Nashville, TN",
  373:"Chattanooga, TN",374:"Chattanooga, TN",
  377:"Knoxville, TN",378:"Knoxville, TN",
  380:"Memphis, TN",381:"Memphis, TN",
  // KY
  400:"Louisville, KY",401:"Louisville, KY",402:"Louisville, KY",
  // OH
  430:"Columbus, OH",431:"Columbus, OH",432:"Columbus, OH",
  440:"Cleveland, OH",441:"Cleveland, OH",442:"Cleveland, OH",443:"Akron, OH",444:"Youngstown, OH",
  450:"Cincinnati, OH",451:"Cincinnati, OH",452:"Cincinnati, OH",
  453:"Dayton, OH",454:"Dayton, OH",
  // IN
  460:"Indianapolis, IN",461:"Indianapolis, IN",462:"Indianapolis, IN",
  467:"Fort Wayne, IN",468:"Fort Wayne, IN",
  // MI
  480:"Detroit, MI",481:"Detroit, MI",482:"Detroit, MI",483:"Ann Arbor, MI",
  484:"Flint, MI",485:"Flint, MI",
  490:"Grand Rapids, MI",491:"Grand Rapids, MI",
  // IA
  500:"Des Moines, IA",501:"Des Moines, IA",502:"Des Moines, IA",
  // MN
  550:"Minneapolis, MN",551:"Minneapolis, MN",552:"Minneapolis, MN",
  553:"Minneapolis, MN",554:"Minneapolis, MN",555:"Minneapolis, MN",
  // IL — all Chicago metro prefixes 600-608
  600:"Chicago, IL",601:"Chicago suburbs, IL",602:"Chicago suburbs, IL",
  603:"Chicago suburbs, IL",604:"Chicago suburbs, IL",605:"Chicago suburbs, IL",
  606:"Chicago, IL",607:"Chicago suburbs, IL",608:"Chicago suburbs, IL",
  610:"Rockford, IL",611:"Rockford, IL",614:"Peoria, IL",615:"Peoria, IL",
  616:"Peoria, IL",620:"Springfield, IL",622:"Springfield, IL",
  626:"Springfield, IL",627:"Springfield, IL",
  // MO
  630:"St. Louis, MO",631:"St. Louis, MO",632:"St. Louis, MO",
  633:"St. Louis, MO",634:"St. Louis, MO",
  640:"Kansas City, MO",641:"Kansas City, MO",
  655:"Springfield, MO",656:"Springfield, MO",
  // KS
  660:"Wichita, KS",661:"Wichita, KS",662:"Wichita, KS",
  670:"Wichita, KS",671:"Wichita, KS",
  // NE
  680:"Omaha, NE",681:"Omaha, NE",685:"Lincoln, NE",
  // LA
  700:"New Orleans, LA",701:"New Orleans, LA",
  707:"Baton Rouge, LA",708:"Baton Rouge, LA",
  710:"Shreveport, LA",711:"Shreveport, LA",
  // AR
  720:"Little Rock, AR",721:"Little Rock, AR",722:"Little Rock, AR",
  // OK
  730:"Oklahoma City, OK",731:"Oklahoma City, OK",
  740:"Tulsa, OK",741:"Tulsa, OK",
  // TX
  750:"Dallas, TX",751:"Dallas, TX",752:"Dallas, TX",
  753:"Dallas, TX",754:"Dallas, TX",
  760:"Fort Worth, TX",761:"Fort Worth, TX",762:"Fort Worth, TX",
  770:"Houston, TX",771:"Houston, TX",772:"Houston, TX",
  773:"Houston, TX",774:"Houston, TX",
  775:"Houston, TX",776:"Houston, TX",777:"Beaumont, TX",
  780:"San Antonio, TX",781:"San Antonio, TX",782:"San Antonio, TX",
  783:"Corpus Christi, TX",784:"Corpus Christi, TX",
  786:"Austin, TX",787:"Austin, TX",788:"Austin, TX",
  793:"Lubbock, TX",794:"Lubbock, TX",
  795:"El Paso, TX",796:"El Paso, TX",797:"El Paso, TX",
  // CO
  800:"Denver, CO",801:"Denver, CO",802:"Denver, CO",
  803:"Denver, CO",804:"Denver, CO",
  808:"Colorado Springs, CO",809:"Colorado Springs, CO",
  // ID
  836:"Boise, ID",837:"Boise, ID",838:"Boise, ID",
  // UT
  840:"Salt Lake City, UT",841:"Salt Lake City, UT",842:"Salt Lake City, UT",
  843:"Ogden, UT",844:"Ogden, UT",846:"Provo, UT",847:"Provo, UT",
  // AZ
  850:"Phoenix, AZ",851:"Phoenix, AZ",852:"Scottsdale, AZ",
  853:"Mesa, AZ",854:"Mesa, AZ",855:"Phoenix, AZ",
  856:"Tucson, AZ",857:"Tucson, AZ",
  // NM
  870:"Albuquerque, NM",871:"Albuquerque, NM",872:"Albuquerque, NM",
  // NV
  889:"Las Vegas, NV",890:"Las Vegas, NV",891:"Las Vegas, NV",
  892:"Las Vegas, NV",893:"Las Vegas, NV",894:"Reno, NV",895:"Reno, NV",
  // CA
  900:"Los Angeles, CA",901:"Los Angeles, CA",902:"Los Angeles, CA",
  903:"Los Angeles, CA",904:"Los Angeles, CA",905:"Los Angeles, CA",
  906:"Los Angeles, CA",907:"Los Angeles, CA",908:"Los Angeles, CA",
  910:"Pasadena, CA",911:"Pasadena, CA",912:"Los Angeles, CA",
  913:"Los Angeles, CA",914:"Van Nuys, CA",915:"Burbank, CA",
  916:"North Hollywood, CA",917:"Woodland Hills, CA",918:"Thousand Oaks, CA",
  919:"San Diego, CA",920:"San Diego, CA",921:"San Diego, CA",
  922:"San Diego, CA",923:"San Diego, CA",924:"San Diego, CA",
  925:"San Jose, CA",926:"Santa Ana, CA",927:"Anaheim, CA",928:"Riverside, CA",
  930:"Oxnard, CA",931:"Santa Barbara, CA",932:"Bakersfield, CA",933:"Bakersfield, CA",
  936:"Fresno, CA",937:"Fresno, CA",
  940:"San Francisco, CA",941:"San Francisco, CA",942:"Sacramento, CA",
  943:"San Jose, CA",944:"San Mateo, CA",945:"Oakland, CA",946:"Oakland, CA",
  947:"Berkeley, CA",948:"Richmond, CA",949:"San Jose, CA",950:"San Jose, CA",
  951:"San Jose, CA",952:"Stockton, CA",953:"Modesto, CA",
  954:"Santa Rosa, CA",955:"Eureka, CA",956:"Sacramento, CA",957:"Sacramento, CA",
  958:"Sacramento, CA",959:"Sacramento, CA",
  // HI
  967:"Honolulu, HI",968:"Honolulu, HI",
  // OR
  970:"Portland, OR",971:"Portland, OR",972:"Portland, OR",
  973:"Salem, OR",974:"Eugene, OR",975:"Medford, OR",
  // WA
  980:"Seattle, WA",981:"Seattle, WA",982:"Tacoma, WA",983:"Tacoma, WA",
  984:"Olympia, WA",985:"Olympia, WA",
  // WY
  820:"Cheyenne, WY",821:"Cheyenne, WY",
  // SD/ND
  570:"Sioux Falls, SD",577:"Rapid City, SD",
  580:"Fargo, ND",581:"Fargo, ND",585:"Bismarck, ND",
  // WI
  530:"Milwaukee, WI",531:"Milwaukee, WI",532:"Milwaukee, WI",
  535:"Madison, WI",537:"Madison, WI",541:"Green Bay, WI",
  // Spokane/AK
  990:"Spokane, WA",991:"Spokane, WA",995:"Anchorage, AK",
};

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
export function calcQuote({ inputs, pkg, marketTier, products, settings, aiMultiplierOverride, repCommissionRate }) {
  if (!pkg || !marketTier || !settings) return null;

  const s = settings; // shorthand — settings is a key→value map
  // aiMultiplierOverride takes precedence when market analysis has been accepted
  const mktMult = aiMultiplierOverride != null ? aiMultiplierOverride : (parseFloat(marketTier.labor_multiplier) || 1);

  // ── Managed IT base — market multiplier applied to sell rates ────────────
  const wB  = inputs.workstations * pkg.ws_rate    * mktMult;
  const uB  = inputs.users        * pkg.user_rate  * mktMult;
  const sB  = inputs.servers      * pkg.server_rate * mktMult;
  const lB  = inputs.locations    * pkg.location_rate * mktMult;
  const tB  = inputs.cloudTenants * pkg.tenant_rate * mktMult;
  const xv  = Math.max(inputs.vendors - pkg.included_vendors, 0);
  const vB  = xv * pkg.vendor_rate * mktMult;

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
  let discountableAddonRevenue   = 0;  // products eligible for contract discount
  let protectedAddonRevenue      = 0;  // MSRP products — never discounted
  let nonCommissionAddonRevenue  = 0;  // products excluded from commission base
  let addonCost = 0;

  for (const product of products.filter(p => inputs.selectedProducts?.includes(p.id))) {
    const sellQty = getSellQty(product, inputs);
    const costQty = getCostQty(product, inputs);
    const revenue = sellQty * product.sell_price;
    const cost    = costQty * product.cost_price;

    if (product.no_discount) {
      protectedAddonRevenue += revenue;     // passes through at full MSRP
    } else {
      discountableAddonRevenue += revenue;  // eligible for contract discount
    }
    if (product.no_commission) {
      nonCommissionAddonRevenue += revenue; // excluded from commission base
    }

    addonCost += cost;
    lineItems.push({
      product_id:       product.id,
      product_name:     product.name,
      category:         product.category,
      qty_driver:       product.qty_driver,
      cost_qty_driver:  product.cost_qty_driver || null,
      qty:              sellQty,
      cost_qty:         costQty,
      sell_price:       product.sell_price,
      cost_price:       product.cost_price,
      no_discount:      product.no_discount  || false,
      no_commission:    product.no_commission || false,
      revenue,
      cost
    });
  }

  const addonRevenue = discountableAddonRevenue + protectedAddonRevenue;

  // ── Composite multiplier (applies to labor + discountable addons only) ────
  const compMult = (RISK_M[inputs.industryRisk] || 1)
                 * (COMP_M[inputs.compliance]    || 1)
                 * (CPLX_M[inputs.complexity]    || 1);

  // Labor + discountable products get the risk/compliance multiplier
  const discountableSubtotal = (itSubtotal + discountableAddonRevenue) * compMult;
  // Protected products pass through untouched
  const riskAdjMRR = discountableSubtotal + protectedAddonRevenue;

  // ── Floor + discount (labor + discountable addons only) ───────────────────
  const floor    = parseFloat(s.min_commitment) || 350;
  const discKey  = `contract_disc_${inputs.contractTerm}`;
  const discRate = parseFloat(s[discKey]) || 0;
  // Discount only on the portion above the floor, and only on discountable revenue
  const discountableAboveFloor = Math.max(discountableSubtotal - floor, 0);
  const discount  = -discountableAboveFloor * discRate;
  const discountedLabor = Math.max(discountableSubtotal + discount, floor);
  const finalMRR  = discountedLabor + protectedAddonRevenue;

  // ── Commission ────────────────────────────────────────────────────────────
  // Rep-level rate takes priority over global setting
  const commissionRate = repCommissionRate != null ? repCommissionRate : (parseFloat(s.commission_rate) || 0);
  // Commission base = discounted labor + commissionable addons (excludes no_commission products)
  const commissionBase  = discountedLabor + (discountableAddonRevenue - nonCommissionAddonRevenue) * (1 - discRate);
  const commission      = commissionBase * commissionRate;
  const netAfterCommission = finalMRR - commission;

  // ── Cost model ────────────────────────────────────────────────────────────
  const toolingCost = inputs.workstations * parseFloat(s.stack_cost_per_ws)
                    + inputs.users        * parseFloat(s.stack_cost_per_user)
                    + inputs.servers      * parseFloat(s.stack_cost_per_server)
                    + inputs.cloudTenants * parseFloat(s.stack_cost_per_tenant);

  const svcHrs = inputs.users        * pkg.hrs_user
               + inputs.workstations * pkg.hrs_ws
               + inputs.servers      * pkg.hrs_server
               + inputs.locations    * pkg.hrs_location;
  const svcCost = svcHrs * parseFloat(s.burdened_hourly_rate);

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
    discountedLabor, protectedAddonRevenue, discountableAddonRevenue,
    commission, commissionRate, commissionBase, netAfterCommission,
    // Cost model
    toolingCost, svcHrs, svcCost, addonCost, totalCost, impliedGM,
    // Onboarding
    onboarding, obCalc, onboardingIsMinimum: obCalc < obMin,
    // Meta
    recommended, mktMult
  };
}

function getQtyForDriver(driver, inputs) {
  switch (driver) {
    case 'user':          return inputs.users;
    case 'mailbox':       return inputs.users + (inputs.sharedMailboxes || 0);
    case 'workstation':   return inputs.workstations;
    case 'server':        return inputs.servers;
    case 'location':      return inputs.locations;
    case 'flat':          return 1;
    case 'mobile_device': return inputs.mobileDevices || 0;
    case 'mixed':         return inputs.workstations;
    default:              return 0;
  }
}

function getSellQty(product, inputs) {
  return getQtyForDriver(product.qty_driver, inputs);
}

function getCostQty(product, inputs) {
  // cost_qty_driver overrides qty_driver for cost calculation
  // NULL means same as sell driver
  const driver = product.cost_qty_driver || product.qty_driver;
  return getQtyForDriver(driver, inputs);
}

// ─── FORMAT HELPERS ──────────────────────────────────────────────────────────
export const fmt$ = (v, d = 2) => v == null ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
      minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
export const fmt$0 = v => fmt$(v, 0);
export const fmtPct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
export const gmColor = g => g >= 0.45 ? '#166534' : g >= 0.30 ? '#92400e' : '#991b1b';
export const gmBg    = g => g >= 0.45 ? '#dcfce7' : g >= 0.30 ? '#fef3c7' : '#fee2e2';

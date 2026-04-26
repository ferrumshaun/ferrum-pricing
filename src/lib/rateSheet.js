// rateSheet.js — generates market-adjusted out-of-scope rate sheet

// Area 2 (Metro/Extended) locations — +30% surcharge applies
const AREA2_CITIES = [
  { state: 'AK' },
  { state: 'HI' },
  { state: 'CA', cities: ['San Francisco', 'Berkeley', 'Fremont', 'Milpitas', 'Mountain View', 'Oakland', 'San Jose', 'San Leandro', 'San Mateo', 'Palo Alto', 'Redwood City', 'Richmond', 'Union City'] },
  { state: 'NV', cities: ['Las Vegas'] },
  { state: 'NY', cities: ['New York City', 'New York', 'Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island', 'Long Island'] },
  { state: 'WA', cities: ['Seattle', 'Mercer Island'] },
];

export function isArea2(city, state) {
  if (!state) return false;
  const match = AREA2_CITIES.find(a => a.state === state.toUpperCase());
  if (!match) return false;
  if (!match.cities) return true; // entire state (AK, HI)
  return match.cities.some(c => city?.toLowerCase().includes(c.toLowerCase()));
}

// Round to nearest $0.50 for cleaner presentation
function roundRate(r) {
  return Math.round(r * 2) / 2;
}

export function buildRateSheet({ analysis, settings, clientName, recipientContact, marketOverride }) {
  const s = settings || {};
  const rates = analysis?.rates || {};
  const mult  = analysis?.pricing_multiplier ?? 1;
  const city  = analysis?.city  || marketOverride?.city  || '';
  const state = analysis?.state || marketOverride?.state || '';
  const tier  = analysis?.market_tier || 'standard';
  const area2 = isArea2(city, state);
  const area2Mult = area2 ? (1 + parseFloat(s.oos_area2_surcharge || 0.30)) : 1;

  // Base rates from market analysis (already market-adjusted)
  const remoteRate   = roundRate((rates.remote_support  || 165) * area2Mult);
  const onsiteRate   = roundRate((rates.onsite_additional || 165) * area2Mult);
  const devRate      = roundRate((rates.dev_crm          || 220) * area2Mult);
  const designRate   = roundRate((rates.design_ux        || 140) * area2Mult);
  const pcSetup      = roundRate((rates.pc_setup         || 250) * area2Mult);

  // Fixed fees (flat — don't vary by market, but area2 surcharge applies)
  const fee = (key, def) => roundRate(parseFloat(s[key] || def) * area2Mult);
  const fixedFee = (key, def) => parseFloat(s[key] || def); // truly fixed — no mult

  const sameDayFee       = fee('oos_same_day_fee',             200);
  const nextDayFee       = fee('oos_next_day_fee',             100);
  const cancellationFee  = fee('oos_cancellation_fee',         125);
  const abortFee         = fee('oos_abort_fee',                195);

  // After-hours dispatch (flat, area2 applies)
  const ahWeekdayDisp    = fee('oos_afterhours_weekday_disp',   300);
  const ahWeekendDisp    = fee('oos_afterhours_weekend_disp',   285);
  const ahSatNightDisp   = fee('oos_afterhours_satnight_disp',  285);
  const ahGraveyardDisp  = fee('oos_afterhours_graveyard_disp', 380);

  // After-hours additional hourly = remote rate * multiplier
  const ahStdMult      = parseFloat(s.oos_afterhours_mult_standard  || 1.5);
  const ahGraveMult    = parseFloat(s.oos_afterhours_mult_graveyard || 2.0);
  const ahStdRate      = roundRate(remoteRate * ahStdMult);
  const ahGraveRate    = roundRate(remoteRate * ahGraveMult);

  const exceptionalMarkup = (parseFloat(s.oos_exceptional_markup || 0.20) * 100).toFixed(0);
  const area2SurchargePct = (parseFloat(s.oos_area2_surcharge    || 0.30) * 100).toFixed(0);

  return {
    meta: {
      clientName,
      recipientContact,
      city, state, tier, mult,
      area2, area2SurchargePct,
      generatedAt: new Date().toISOString(),
    },
    sections: [
      {
        id: 'remote',
        title: 'Remote Labor & Support',
        note: null,
        items: [
          { service: 'Remote Access & Support',  rate: remoteRate, unit: '/hr', minimum: '20 Minute Minimum' },
          { service: 'Help Desk Support',         rate: remoteRate, unit: '/hr', minimum: '20 Minute Minimum' },
          { service: 'Out of Scope Labor',        rate: remoteRate, unit: '/hr', minimum: '20 Minute Minimum' },
          { service: 'New PC Setup',              rate: pcSetup,    unit: '/ea', minimum: null },
        ],
      },
      {
        id: 'dev',
        title: 'Application, Website & Development',
        note: 'Any custom application or development needs will be addressed under a separate scope of work and project summary.',
        items: [
          { service: 'Software & Application Development', rate: devRate,    unit: '/hr', minimum: '1 Hour Minimum' },
          { service: 'CRM & Custom Integrations',          rate: devRate,    unit: '/hr', minimum: '1 Hour Minimum' },
          { service: 'Database Maintenance',               rate: devRate,    unit: '/hr', minimum: '1 Hour Minimum' },
          { service: 'Website Maintenance & Build',        rate: devRate,    unit: '/hr', minimum: '1 Hour Minimum' },
          { service: 'Graphics Design & UX',               rate: designRate, unit: '/hr', minimum: '1 Hour Minimum' },
        ],
      },
      {
        id: 'onsite',
        title: 'On-Site Labor & Dispatches',
        note: null,
        items: [
          { service: 'On-Site Maintenance & Support Labor', rate: onsiteRate,      unit: '/hr', minimum: '2 Hour Minimum' },
          { service: 'Same Day Fee',                        rate: sameDayFee,      unit: '',    minimum: null },
          { service: 'Next Day Fee',                        rate: nextDayFee,      unit: '',    minimum: null },
          { service: 'Cancellation Fee',                    rate: cancellationFee, unit: '',    minimum: null },
          { service: 'Abort Fee',                           rate: abortFee,        unit: '',    minimum: null },
        ],
      },
      {
        id: 'afterhours',
        title: 'After Hours & Extended Coverage',
        note: null,
        items: [
          { service: 'Weekdays 5pm–11pm — Dispatch',           rate: ahWeekdayDisp,   unit: '',    minimum: null },
          { service: 'Weekdays 5pm–11pm — Additional',         rate: ahStdRate,       unit: '/hr', minimum: null },
          { service: 'Weekends 7am–5pm — Dispatch',            rate: ahWeekendDisp,   unit: '',    minimum: null },
          { service: 'Weekends 7am–5pm — Additional',          rate: ahStdRate,       unit: '/hr', minimum: null },
          { service: 'Saturday 5pm–11pm — Dispatch',           rate: ahSatNightDisp,  unit: '',    minimum: null },
          { service: 'Saturday 5pm–11pm — Additional',         rate: ahStdRate,       unit: '/hr', minimum: null },
          { service: 'Graveyard & Sundays — Dispatch',         rate: ahGraveyardDisp, unit: '',    minimum: null },
          { service: 'Graveyard & Sundays — Additional',       rate: ahGraveRate,     unit: '/hr', minimum: null },
          { service: 'Exceptional Charges',                    rate: null,            unit: '',    minimum: null, label: `Cost + ${exceptionalMarkup}%` },
          ...(area2 ? [] : [
            { service: 'Metropolitan / Extended Area Coverage', rate: null, unit: '', minimum: null, label: `+${area2SurchargePct}% surcharge — applies to all charges` },
          ]),
        ],
      },
    ],
  };
}

// Format a rate for display
export function fmtRate(item) {
  if (item.label) return item.label;
  if (item.rate === null) return '—';
  const r = `$${item.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return item.minimum ? `${r}${item.unit} (${item.minimum})` : `${r}${item.unit}`;
}

// rateSheet.js — generates market-adjusted out-of-scope rate sheet
//
// All rates are derived from real-time market intelligence (analysis.rates) and
// the static admin-configured fees in pricing_settings. The legacy +30%
// "Metropolitan / Extended Area" surcharge was removed in v3.5.4 — it existed
// as a fail-safe when our hourly was lower than local market rates, which is
// no longer needed now that pricing comes directly from market analysis.

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

  // Base rates — straight from market analysis, no surcharge multiplier
  const remoteRate   = roundRate(rates.remote_support  || 165);
  const onsiteRate   = roundRate(rates.onsite_additional || 165);
  const devRate      = roundRate(rates.dev_crm          || 220);
  const designRate   = roundRate(rates.design_ux        || 140);
  const pcSetup      = roundRate(rates.pc_setup         || 250);

  // Fixed fees — admin-configured, applied as-is
  const fee = (key, def) => roundRate(parseFloat(s[key] || def));

  const sameDayFee       = fee('oos_same_day_fee',             200);
  const nextDayFee       = fee('oos_next_day_fee',             100);
  const cancellationFee  = fee('oos_cancellation_fee',         125);
  const abortFee         = fee('oos_abort_fee',                195);

  // After-hours dispatch (flat)
  const ahWeekdayDisp    = fee('oos_afterhours_weekday_disp',   300);
  const ahWeekendDisp    = fee('oos_afterhours_weekend_disp',   285);
  const ahSatNightDisp   = fee('oos_afterhours_satnight_disp',  285);
  const ahGraveyardDisp  = fee('oos_afterhours_graveyard_disp', 380);

  // After-hours additional hourly = remote rate × multiplier
  const ahStdMult      = parseFloat(s.oos_afterhours_mult_standard  || 1.5);
  const ahGraveMult    = parseFloat(s.oos_afterhours_mult_graveyard || 2.0);
  const ahStdRate      = roundRate(remoteRate * ahStdMult);
  const ahGraveRate    = roundRate(remoteRate * ahGraveMult);

  const exceptionalMarkup = (parseFloat(s.oos_exceptional_markup || 0.20) * 100).toFixed(0);

  return {
    meta: {
      clientName,
      recipientContact,
      city, state, tier, mult,
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

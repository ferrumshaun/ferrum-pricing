-- ─────────────────────────────────────────────────────────────────────────────
-- Target Gross Margin setting — v3.5.34 (GM warning)
--
-- Adds a global target_gross_margin row to pricing_settings. Quote pages
-- read this on render and compare against the quote's implied GM. When the
-- quote falls below target, a banner/badge surfaces in the cost panel:
--   GM ≥ target               → green "at target" badge (or hidden)
--   target − 5pp ≤ GM < target → amber "X points below target"
--   GM < target − 5pp          → red "underpriced — X points below target"
--   locked quote (any GM)      → gray informational badge (no urgency)
--
-- Stored as decimal (0.40 = 40%) for math consistency with commission_rate
-- and contract_disc_*. Default 0.40 — admin should change to their actual
-- target once they've done the MROC math (see chat for the framework).
--
-- If admin clears the value (sets to empty/null), the warning disables
-- entirely — by design, lets admin opt out without code changes.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.pricing_settings (key, value, label, description)
values (
  'target_gross_margin',
  '0.40',
  'Target Gross Margin',
  'Minimum gross margin we expect on Managed IT quotes, expressed as a decimal (0.40 = 40%). Quote pages show a warning badge when the implied GM falls below this. Set to empty/null to disable the warning. Recommend setting to (1 − overhead-to-revenue ratio) plus a healthy buffer.'
)
on conflict (key) do nothing;

-- Verification:
-- select * from public.pricing_settings where key = 'target_gross_margin';

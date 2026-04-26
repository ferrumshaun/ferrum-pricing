-- FerrumIT: Flex Time Blocks

-- 1. Package flex_time_model flag
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS flex_time_model text DEFAULT 'none'
  CHECK (flex_time_model IN ('none','included','required','all_inclusive'));

COMMENT ON COLUMN packages.flex_time_model IS
  'none=no flex time | included=X min/WS per month | required=must purchase | all_inclusive=unlimited';

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS flex_included_mins_per_ws integer DEFAULT 0;

COMMENT ON COLUMN packages.flex_included_mins_per_ws IS
  'Minutes of flex time included per workstation per month (only when flex_time_model=included)';

-- 2. Flex time discount tiers in pricing_settings
INSERT INTO pricing_settings (key, value, description) VALUES
  ('flex_discount_5hr',   '0.10', 'Flex Time Block — 5hr discount off T&M rate'),
  ('flex_discount_10hr',  '0.15', 'Flex Time Block — 10hr discount off T&M rate'),
  ('flex_discount_20hr',  '0.20', 'Flex Time Block — 20hr discount off T&M rate'),
  ('flex_discount_30hr',  '0.22', 'Flex Time Block — 30hr discount off T&M rate'),
  ('flex_discount_40hr',  '0.25', 'Flex Time Block — 40hr discount off T&M rate'),
  ('tier3_rate_multiplier','1.75','Tier 3 / Senior Technical rate multiplier vs remote T&M rate'),
  ('tier3_rate_override',  '',    'Tier 3 flat rate override (leave blank to use multiplier)')
ON CONFLICT (key) DO NOTHING;

SELECT 'Flex Time settings added' as result;

-- Flex time block configuration (hours and discounts — admin-editable)
INSERT INTO pricing_settings (key, value, description) VALUES
  ('flex_block_1_hours',   '5',    'Flex Time Block 1 — hours'),
  ('flex_block_2_hours',   '10',   'Flex Time Block 2 — hours'),
  ('flex_block_3_hours',   '20',   'Flex Time Block 3 — hours'),
  ('flex_block_4_hours',   '30',   'Flex Time Block 4 — hours'),
  ('flex_block_5_hours',   '40',   'Flex Time Block 5 — hours'),
  ('flex_block_1_label',   'Starter Block',    'Flex Time Block 1 — label'),
  ('flex_block_2_label',   'Standard Block',   'Flex Time Block 2 — label'),
  ('flex_block_3_label',   'Extended Block',   'Flex Time Block 3 — label'),
  ('flex_block_4_label',   'Pro Block',        'Flex Time Block 4 — label'),
  ('flex_block_5_label',   'Enterprise Block', 'Flex Time Block 5 — label')
ON CONFLICT (key) DO NOTHING;

-- Voice BYOH fee (bring your own handset — wipe and register)
INSERT INTO pricing_settings (key, value, description) VALUES
  ('voice_byoh_fee', '20', 'Voice BYOH wipe & register fee per device ($)')
ON CONFLICT (key) DO NOTHING;

-- FerrumIT: Rate sheet settings + SPT integration fields

-- Fixed fees for rate sheet (don't vary by market)
INSERT INTO pricing_settings (key, value, description) VALUES
  ('oos_same_day_fee',              '200',  'On-site same day dispatch fee (flat)'),
  ('oos_next_day_fee',              '100',  'On-site next day dispatch fee (flat)'),
  ('oos_cancellation_fee',          '125',  'On-site cancellation fee (flat)'),
  ('oos_abort_fee',                 '195',  'On-site abort fee (flat)'),
  ('oos_afterhours_weekday_disp',   '300',  'After-hours weekday dispatch fee (flat, 5pm-11pm)'),
  ('oos_afterhours_weekend_disp',   '285',  'After-hours weekend dispatch fee (flat, 7am-5pm)'),
  ('oos_afterhours_satnight_disp',  '285',  'After-hours Saturday night dispatch fee (flat, 5pm-11pm)'),
  ('oos_afterhours_graveyard_disp', '380',  'After-hours graveyard/Sunday dispatch fee (flat)'),
  ('oos_afterhours_mult_standard',  '1.5',  'After-hours additional hourly multiplier (weekday/weekend)'),
  ('oos_afterhours_mult_graveyard', '2.0',  'After-hours graveyard/Sunday hourly multiplier'),
  ('oos_area2_surcharge',           '0.30', 'Metropolitan/Extended Area 2 surcharge rate (+30%)'),
  ('oos_exceptional_markup',        '0.20', 'Exceptional charges markup rate (+20%)'),
  ('spt_api_key',                   '',     'Smart Pricing Table API key — from SPT profile settings')
ON CONFLICT (key) DO NOTHING;

-- SPT proposal link on quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS spt_proposal_id text,
  ADD COLUMN IF NOT EXISTS spt_synced_at   timestamptz;

SELECT 'Rate sheet settings added' as result;

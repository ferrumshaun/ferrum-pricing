-- FerrumIT v2.5.0: Multi-site quote support
-- Run in Supabase SQL Editor

-- Multi-location discount tiers
INSERT INTO pricing_settings (key, value, description) VALUES
  ('multisite_disc_2_4',    '0.03', 'Multi-location discount: 2-4 locations (3% off labor)'),
  ('multisite_disc_5_9',    '0.05', 'Multi-location discount: 5-9 locations (5% off labor)'),
  ('multisite_disc_10_19',  '0.08', 'Multi-location discount: 10-19 locations (8% off labor)'),
  ('multisite_disc_20plus', '0.10', 'Multi-location discount: 20+ locations (10% off labor)')
ON CONFLICT (key) DO NOTHING;

-- Verify
SELECT key, value, description FROM pricing_settings WHERE key LIKE 'multisite%';

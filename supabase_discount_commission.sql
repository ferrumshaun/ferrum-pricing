-- FerrumIT v2.4.0: Product protection flags + rep commission rates
-- Run in Supabase SQL Editor

-- 1. Add no_discount and no_commission flags to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS no_discount   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_commission boolean NOT NULL DEFAULT false;

-- 2. Pre-flag known MSRP/vendor products
UPDATE products SET no_discount = true, no_commission = true
WHERE name ILIKE '%SentinelOne%'
   OR name ILIKE '%ThreatLocker%'
   OR name ILIKE '%INKY%'
   OR name ILIKE '%DropSuite%'
   OR name ILIKE '%SaaSAlerts%'
   OR name ILIKE '%NinjaOne%'
   OR name ILIKE '%Huntress%'
   OR name ILIKE '%Datto%'
   OR name ILIKE '%Acronis%'
   OR name ILIKE '%Webroot%'
   OR name ILIKE '%Malwarebytes%';

-- 3. Add commission_rate to profiles (per-user, null = use global)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_rate numeric;

-- 4. Add rep_id to quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS rep_id uuid REFERENCES profiles(id);

-- 5. Backfill rep_id from created_by
UPDATE quotes SET rep_id = created_by WHERE rep_id IS NULL AND created_by IS NOT NULL;

-- 6. Global commission fallback in pricing_settings
INSERT INTO pricing_settings (key, value, description)
VALUES ('commission_rate', '0.10', 'Default sales commission rate (e.g. 0.10 = 10%). Overridden per user in Admin → Users.')
ON CONFLICT (key) DO NOTHING;

-- 7. Verify
SELECT 'Products flagged' as check, count(*) as count FROM products WHERE no_discount = true;
SELECT 'Global commission rate' as check, value FROM pricing_settings WHERE key = 'commission_rate';
SELECT 'Quotes with rep_id' as check, count(*) as count FROM quotes WHERE rep_id IS NOT NULL;

-- ── v2.4.0 additions: compliance tags + payment surcharge settings ────────────

-- 8. Add compliance_tags and recommendation_reason to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS compliance_tags      text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recommendation_reason text;

-- 9. Pre-tag known compliance products
-- Security Awareness Training → HIPAA, SOC2, PCI, CMMC
UPDATE products SET
  compliance_tags = ARRAY['hipaa','soc2','pci','cmmc'],
  recommendation_reason = 'Required for most compliance frameworks — employee security training is mandated under HIPAA, SOC 2, PCI DSS, and CMMC'
WHERE name ILIKE '%Security Awareness%' OR name ILIKE '%KnowBe4%' OR name ILIKE '%Proofpoint%';

-- INKY Advanced / DLP → HIPAA (email encryption required)
UPDATE products SET
  compliance_tags = ARRAY['hipaa'],
  recommendation_reason = 'HIPAA requires email encryption for PHI — INKY Advanced includes DLP and encryption enforcement'
WHERE name ILIKE '%INKY%' AND (name ILIKE '%Advanced%' OR name ILIKE '%DLP%' OR name ILIKE '%Enterprise%');

-- ThreatLocker → PCI, CMMC (application whitelisting required)
UPDATE products SET
  compliance_tags = ARRAY['pci','cmmc'],
  recommendation_reason = 'PCI DSS and CMMC require application control — ThreatLocker provides zero-trust application whitelisting'
WHERE name ILIKE '%ThreatLocker%';

-- SentinelOne Complete → HIPAA, PCI, CMMC (EDR required)
UPDATE products SET
  compliance_tags = ARRAY['hipaa','pci','cmmc'],
  recommendation_reason = 'Advanced EDR with rollback required for HIPAA, PCI DSS, and CMMC Level 2+ — SentinelOne Complete meets these requirements'
WHERE name ILIKE '%SentinelOne%' AND (name ILIKE '%Complete%' OR name ILIKE '%Enterprise%');

-- 10. Payment surcharge settings
INSERT INTO pricing_settings (key, value, description) VALUES
  ('payment_cc_surcharge', '0.02',  'Credit card payment surcharge as a decimal (e.g. 0.02 = 2%)'),
  ('payment_ach_fee',      '0',     'ACH/EFT payment fee in dollars (0 = free)'),
  ('payment_check_fee',    '10',    'Check payment administrative fee in dollars')
ON CONFLICT (key) DO NOTHING;

-- 11. Verify
SELECT name, compliance_tags, recommendation_reason FROM products WHERE array_length(compliance_tags, 1) > 0;
SELECT key, value FROM pricing_settings WHERE key LIKE 'payment_%';

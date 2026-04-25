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

-- FerrumIT: Price lock for approved quotes
-- Run in Supabase SQL Editor

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS pricing_snapshot  jsonb,
  ADD COLUMN IF NOT EXISTS price_locked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS price_locked_by   uuid REFERENCES profiles(id);

-- Index for quick locked quote lookups
CREATE INDEX IF NOT EXISTS idx_quotes_price_locked ON quotes(price_locked_at) WHERE price_locked_at IS NOT NULL;

SELECT 'Price lock columns added' as result;

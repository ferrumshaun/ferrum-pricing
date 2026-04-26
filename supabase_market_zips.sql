-- Add zip_codes array to track all zips that map to each city
ALTER TABLE market_rate_analyses
  ADD COLUMN IF NOT EXISTS zip_codes text[] DEFAULT '{}';

-- Backfill: move existing single zip into the array
UPDATE market_rate_analyses
SET zip_codes = ARRAY[zip]
WHERE zip IS NOT NULL
  AND zip ~ '^[0-9]{5}$'
  AND (zip_codes IS NULL OR zip_codes = '{}');

-- Verify
SELECT city, state, zip, zip_codes FROM market_rate_analyses ORDER BY state, city LIMIT 20;

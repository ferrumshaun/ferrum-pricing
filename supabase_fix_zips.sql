-- Fix bad zip codes in market_rate_analyses
-- Markets seeded by city/state only have city abbreviations stored as zip

-- Preview what will be fixed
SELECT id, city, state, zip
FROM market_rate_analyses
WHERE zip IS NOT NULL
  AND zip ~ '[^0-9]'   -- contains non-digit characters
ORDER BY state, city;

-- Clear bad zips (non-numeric values like 'MOBIL', 'CHICAGO', etc.)
UPDATE market_rate_analyses
SET zip = NULL
WHERE zip IS NOT NULL
  AND zip ~ '[^0-9]';

-- Also fix any zip codes longer than 5 digits (ZIP+4 stored without hyphen)
UPDATE market_rate_analyses
SET zip = LEFT(zip, 5)
WHERE zip IS NOT NULL
  AND LENGTH(zip) > 5
  AND zip ~ '^[0-9]+$';

-- Verify
SELECT city, state, zip FROM market_rate_analyses ORDER BY state, city;

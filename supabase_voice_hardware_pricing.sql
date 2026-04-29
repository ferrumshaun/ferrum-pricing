-- ─────────────────────────────────────────────────────────────────────────────
-- Voice Hardware: extend with pricing columns — v3.5.22
--
-- Strategy: Add pricing columns to the existing voice_hardware table so it
-- serves two purposes simultaneously:
--   1. BYOH compatibility lookup (existing) — every device we know about
--   2. Sales catalog (new)                  — devices we actively sell, with prices
--
-- The lease_eligible / purchase_eligible flags determine which devices appear
-- in the Voice quote dropdowns. Devices with both flags FALSE are still in the
-- table for BYOH validation but won't show in pricing dropdowns.
--
-- v3.5.23 will rewire VoiceQuotePage / BundleQuotePage / voicePricing.js to
-- read from this table at runtime instead of from the hardcoded YEALINK_MODELS
-- and ATA_MODELS constants in src/lib/voicePricing.js.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add new columns ──────────────────────────────────────────────────────
alter table public.voice_hardware
  add column if not exists catalog_id           text,           -- 'T33G' / 'ht802' / 'custom' — stable id used by quote inputs
  add column if not exists short_label          text,           -- 'Yealink T33G' — display label in dropdowns
  add column if not exists short_description    text,           -- 'Entry level color screen' — secondary line in dropdown
  add column if not exists hardware_type        text,           -- 'phone' / 'ata' / 'dect' / 'headset' / 'gateway' / 'doorphone' / 'other'
  add column if not exists monthly_lease        numeric(8,2),   -- monthly lease price (NULL when not lease-eligible)
  add column if not exists purchase_price       numeric(8,2),   -- one-time purchase price (NULL when not purchase-eligible)
  add column if not exists ports                int,            -- ATA port count (NULL for phones)
  add column if not exists lease_eligible       boolean default false,
  add column if not exists purchase_eligible    boolean default false,
  add column if not exists sort_order           int     default 100;

-- catalog_id is the stable id quote inputs reference. Must be unique among rows
-- where it's set. (Existing BYOH-only devices have catalog_id = NULL, no constraint.)
do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'voice_hardware_catalog_id_unique') then
    create unique index voice_hardware_catalog_id_unique
      on public.voice_hardware (catalog_id) where catalog_id is not null;
  end if;
end $$;

-- ─── 2. Seed/upsert the 11 existing pricing entries ──────────────────────────
-- These are the entries currently hardcoded in src/lib/voicePricing.js.
-- We upsert by catalog_id so re-running this migration is safe.
--
-- For each: if a row with the same catalog_id exists, update pricing/flags.
-- Otherwise insert a new row.

-- ── Yealink phones (lease + purchase) ──
insert into public.voice_hardware
  (manufacturer, model, catalog_id, short_label, short_description, hardware_type,
   monthly_lease, purchase_price, lease_eligible, purchase_eligible,
   category, compatibility, auto_provision, active, sort_order)
values
  ('Yealink', 'T33G',  'T33G', 'Yealink T33G',  'Entry level color screen',          'phone',  6, 169, true, true, 'preferred', 'compatible', true, true, 10),
  ('Yealink', 'T43U',  'T43U', 'Yealink T43U',  'Mid-range USB expansion',           'phone',  8, 179, true, true, 'preferred', 'compatible', true, true, 20),
  ('Yealink', 'T46U',  'T46U', 'Yealink T46U',  'Executive color touchscreen',       'phone', 10, 269, true, true, 'preferred', 'compatible', true, true, 30),
  ('Yealink', 'T48U',  'T48U', 'Yealink T48U',  'Executive large touchscreen',       'phone', 13, 269, true, true, 'preferred', 'compatible', true, true, 40),
  ('Yealink', 'T57W',  'T57W', 'Yealink T57W',  'Flagship large color touchscreen',  'phone', 15, 329, true, true, 'preferred', 'compatible', true, true, 50),
  ('Yealink', 'W60B',  'W60B', 'Yealink W60B',  'DECT cordless base + 1 handset',    'dect',   8, 189, true, true, 'preferred', 'compatible', true, true, 60)
on conflict (catalog_id) where catalog_id is not null
do update set
  short_label       = excluded.short_label,
  short_description = excluded.short_description,
  hardware_type     = excluded.hardware_type,
  monthly_lease     = excluded.monthly_lease,
  purchase_price    = excluded.purchase_price,
  lease_eligible    = excluded.lease_eligible,
  purchase_eligible = excluded.purchase_eligible,
  sort_order        = excluded.sort_order,
  updated_at        = now();

-- ── Grandstream ATAs (purchase only — leasing analog gateways isn't standard) ──
-- Note: ATAs in voicePricing.js have a flat $15/mo "service fee" — that's a
-- per-port voice service, NOT a lease of the hardware itself. So lease_eligible
-- = false here; the $15/mo lives elsewhere as a per-line voice service charge.
-- The hardware itself is purchased outright.
insert into public.voice_hardware
  (manufacturer, model, catalog_id, short_label, short_description, hardware_type,
   monthly_lease, purchase_price, ports, lease_eligible, purchase_eligible,
   category, compatibility, auto_provision, active, sort_order)
values
  ('Grandstream', 'HT802', 'ht802', 'Grandstream HT802', '2 FXS ports — standard analog fax/phone adapter',     'ata', null,  65, 2, false, true, 'supported', 'compatible', true, true, 100),
  ('Grandstream', 'HT812', 'ht812', 'Grandstream HT812', '2 FXS ports — business grade with gigabit ethernet',  'ata', null,  95, 2, false, true, 'supported', 'compatible', true, true, 110),
  ('Grandstream', 'HT814', 'ht814', 'Grandstream HT814', '4 FXS ports — multi-line analog adapter',             'ata', null, 135, 4, false, true, 'supported', 'compatible', true, true, 120),
  ('Grandstream', 'HT818', 'ht818', 'Grandstream HT818', '8 FXS ports — high-density analog gateway',           'ata', null, 195, 8, false, true, 'supported', 'compatible', true, true, 130),
  ('Other',       'BYOD ATA', 'custom', 'Other / BYOD ATA', 'Client-supplied ATA — monthly service fee only',   'ata', null,   0, 1, false, true, 'supported', 'compatible', false, true, 999)
on conflict (catalog_id) where catalog_id is not null
do update set
  short_label       = excluded.short_label,
  short_description = excluded.short_description,
  hardware_type     = excluded.hardware_type,
  purchase_price    = excluded.purchase_price,
  ports             = excluded.ports,
  lease_eligible    = excluded.lease_eligible,
  purchase_eligible = excluded.purchase_eligible,
  sort_order        = excluded.sort_order,
  updated_at        = now();

-- ─── 3. Backfill hardware_type for legacy BYOH-only entries ──────────────────
-- Existing rows in voice_hardware have category='preferred'/'supported'/etc.
-- For ones without a hardware_type set, guess from category:
update public.voice_hardware
set hardware_type = case
  when category in ('headset')   then 'headset'
  when category in ('gateway')   then 'gateway'
  when category in ('doorphone') then 'doorphone'
  when category in ('preferred','supported','legacy') then 'phone'   -- best guess for legacy compat-only entries
  else 'other'
end
where hardware_type is null;

-- ─── 4. Verification query (run this manually after migration) ───────────────
-- Expected: 11 rows with catalog_id set (6 Yealink phones, 5 ATAs).
--
--   select catalog_id, short_label, hardware_type,
--          monthly_lease, purchase_price,
--          lease_eligible, purchase_eligible, sort_order
--   from public.voice_hardware
--   where catalog_id is not null
--   order by sort_order;

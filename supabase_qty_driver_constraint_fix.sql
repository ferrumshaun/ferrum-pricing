-- ─────────────────────────────────────────────────────────────────────────────
-- Fix products_qty_driver_check constraint — v3.5.24
--
-- Problem: AdminPage's QTY_DRIVERS dropdown offers 'manual' as an option, and
--   the React UI on QuotePage / BundleQuotePage / MultiSiteQuotePage already
--   handles it (rep enters qty per quote in inputs.manualQuantities[productId]).
--   src/lib/pricing.js's getQtyForDriver() also has a case for it. But the
--   products table CHECK constraint never got updated, so saving a product
--   with qty_driver='manual' throws:
--
--     new row for relation "products" violates check constraint
--     "products_qty_driver_check"
--
-- Fix: Drop and recreate the constraint with the full intended allow-list.
--   Same fix applied to cost_qty_driver in case a sibling constraint exists.
--
-- Allowed values (must match QTY_DRIVERS in src/pages/AdminPage.js and the
-- switch cases in src/lib/pricing.js's getQtyForDriver()):
--   user, mailbox, workstation, location, server, flat, mixed, mobile_device, manual
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Drop existing check constraints (safe if they don't exist) ──────────────
alter table public.products drop constraint if exists products_qty_driver_check;
alter table public.products drop constraint if exists products_cost_qty_driver_check;

-- ─── Recreate with the full allowed-value set ────────────────────────────────
alter table public.products add constraint products_qty_driver_check
  check (qty_driver in (
    'user', 'mailbox', 'workstation', 'location', 'server',
    'flat', 'mixed', 'mobile_device', 'manual'
  ));

-- cost_qty_driver is nullable (NULL = "use same driver as sell").
-- The constraint allows NULL or any of the same valid values.
alter table public.products add constraint products_cost_qty_driver_check
  check (
    cost_qty_driver is null
    or cost_qty_driver in (
      'user', 'mailbox', 'workstation', 'location', 'server',
      'flat', 'mixed', 'mobile_device', 'manual'
    )
  );

-- ─── Verification (run manually after migration) ─────────────────────────────
-- Should return 2 rows (the two recreated constraints):
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.products'::regclass
--     and conname like '%qty_driver%';

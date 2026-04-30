-- ─────────────────────────────────────────────────────────────────────────────
-- Package Includes — v3.5.30 (Deploy 1: schema + admin UI)
--
-- Adds a join table that lets admin specify which products are bundled into
-- each Managed IT package. When a quote uses such a package, the included
-- products will (in Deploy 2 / v3.5.31):
--   - Show in an "Included with [Package Name]" section above add-ons
--   - Have $0 sell line on the quote (the package fee covers them)
--   - Roll their cost_price × qty into the package COGS for margin reporting
--
-- This deploy ONLY creates the schema and admin UI. Quote pages and the
-- pricing engine are NOT yet aware of this table — they'll be wired up in
-- v3.5.31. Existing quotes are unaffected forever (per design decision in
-- the v3.5.30 planning conversation).
--
-- Design choices documented:
--   - is_mandatory defaults to TRUE — most package includes ARE the package's
--     baseline value. Admin opts INTO swappable per-include.
--   - No qty_override / cost_override columns — products' own qty_driver and
--     cost_qty_driver handle scale. If a product needs different pricing when
--     bundled, model it as a separate product, not an override.
--   - on delete cascade for package_id (deleting a package cleans up its
--     includes), restrict for product_id (can't delete a product still
--     bundled into a package — admin must remove the include first).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.package_includes (
  id            uuid        primary key default uuid_generate_v4(),
  package_id    uuid        not null references public.packages(id) on delete cascade,
  product_id    uuid        not null references public.products(id) on delete restrict,
  is_mandatory  boolean     not null default true,
  notes         text,
  sort_order    int         default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(package_id, product_id)
);

-- Helpful indexes for the queries the admin UI and (later) pricing engine will run
create index if not exists package_includes_package_idx on public.package_includes(package_id);
create index if not exists package_includes_product_idx on public.package_includes(product_id);

-- Verification (run after migration):
-- select count(*) from public.package_includes;     -- should be 0 (table is empty until admin populates)
-- \d public.package_includes                         -- shows full schema in psql

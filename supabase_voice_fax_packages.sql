-- supabase_voice_fax_packages.sql
-- Virtual Fax package catalog with sell + cost split for accurate margin tracking
-- Replaces the hardcoded FAX_PACKAGES constant in lib/voicePricing.js
-- Mirrors the voice_hardware table pattern

create table if not exists voice_fax_packages (
  id                       uuid primary key default gen_random_uuid(),
  package_key              text not null unique,
  label                    text not null,
  sell_mrr                 numeric(10,2) not null default 0,
  cost_mrr                 numeric(10,2) not null default 0,
  included_users           integer not null default 1,
  included_pages           integer,
  included_dids            integer not null default 0,
  overage_sell_per_page    numeric(10,4),
  overage_cost_per_page    numeric(10,4) not null default 0,
  extra_user_sell          numeric(10,2),
  extra_user_cost          numeric(10,2) not null default 0,
  extra_did_sell           numeric(10,2),
  extra_did_cost           numeric(10,2) not null default 0,
  description              text,
  sort_order               integer not null default 0,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- RLS — read for all authed, write for admin role only (matches voice_hardware)
alter table voice_fax_packages enable row level security;

drop policy if exists "All authenticated users can read voice_fax_packages" on voice_fax_packages;
create policy "All authenticated users can read voice_fax_packages"
  on voice_fax_packages for select to authenticated using (true);

drop policy if exists "Admins can manage voice_fax_packages" on voice_fax_packages;
create policy "Admins can manage voice_fax_packages"
  on voice_fax_packages for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create index if not exists voice_fax_packages_active_idx
  on voice_fax_packages (active, sort_order);

-- ── SEED DATA ───────────────────────────────────────────────────────────────
-- Sell prices match the existing hardcoded FAX_PACKAGES constant.
-- Cost values are $0 placeholders — populate in Admin → Voice Fax Packages
-- once you've pulled the actual mFax / Documo tier costs.
insert into voice_fax_packages
  (package_key, label, sell_mrr, cost_mrr, included_users, included_pages, included_dids,
   overage_sell_per_page, overage_cost_per_page, extra_user_sell, extra_user_cost,
   extra_did_sell, extra_did_cost, description, sort_order, active)
values
  ('email_only', 'Email-Only Fax',         9.95,   0, 1,  null, 0,
    null, 0, null, 0, null, 0,
    'Fax to email only — no portal, no DID', 10, true),

  ('solo',       'Virtual Fax — Solo',     12.00,  0, 1,  50,   1,
    0.10, 0, null, 0, null, 0,
    '1 user · 50 pages/mo · 1 DID · $0.10/page overage', 20, true),

  ('team',       'Virtual Fax — Team',     29.00,  0, 5,  500,  1,
    0.08, 0, null, 0, null, 0,
    '5 users · 500 pages/mo · 1 DID · $0.08/page overage', 30, true),

  ('business',   'Virtual Fax — Business', 59.00,  0, 15, 1000, 1,
    0.06, 0, 3.00, 0, 3.00, 0,
    '15 users · 1,000 pages/mo · 1 DID + $3/extra DID or user', 40, true),

  ('infinity',   'Virtual Fax — Infinity', 119.00, 0, 50, 2500, 1,
    0.05, 0, 2.00, 0, 2.00, 0,
    '50 users · 2,500 pages/mo · 1 DID + $2/extra DID or user', 50, true)

on conflict (package_key) do nothing;

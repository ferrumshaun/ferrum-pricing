-- FerrumIT Pricing Platform — Supabase Schema
-- Run this in Supabase → SQL Editor → New Query → Run

-- ─── EXTENSIONS ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── USERS PROFILE TABLE ─────────────────────────────────────────────────────
-- Extends Supabase auth.users with role and display info
create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text not null,
  full_name   text,
  role        text not null default 'user' check (role in ('admin', 'user')),
  created_at  timestamptz not null default now(),
  last_login  timestamptz
);
alter table public.profiles enable row level security;

create policy "Users can read all profiles"
  on public.profiles for select using (auth.role() = 'authenticated');

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── PACKAGES TABLE ──────────────────────────────────────────────────────────
create table public.packages (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null unique,
  ws_rate         numeric(10,2) not null,
  user_rate       numeric(10,2) not null,
  server_rate     numeric(10,2) not null,
  location_rate   numeric(10,2) not null,
  tenant_rate     numeric(10,2) not null default 0,
  included_vendors int not null default 2,
  vendor_rate     numeric(10,2) not null default 25,
  coverage        text not null default 'business_hours',
  hrs_user        numeric(6,4) not null,
  hrs_ws          numeric(6,4) not null,
  hrs_server      numeric(6,4) not null,
  hrs_location    numeric(6,4) not null,
  ideal_desc      text,
  sort_order      int default 0,
  active          boolean default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id)
);
alter table public.packages enable row level security;
create policy "Anyone authenticated can read packages"
  on public.packages for select using (auth.role() = 'authenticated');
create policy "Only admins can modify packages"
  on public.packages for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ─── PRODUCTS TABLE ──────────────────────────────────────────────────────────
create table public.products (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  category        text not null,
  sub_category    text,
  description     text,
  sell_price      numeric(10,2) not null,
  cost_price      numeric(10,2) not null,
  qty_driver      text not null check (qty_driver in ('user','mailbox','workstation','location','server','flat','mixed')),
  exclusive_group text,    -- products in same group are mutually exclusive (e.g. 'inky', 'endpoint_sec')
  active          boolean default true,
  sort_order      int default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id)
);
alter table public.products enable row level security;
create policy "Anyone authenticated can read products"
  on public.products for select using (auth.role() = 'authenticated');
create policy "Only admins can modify products"
  on public.products for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ─── MARKET TIERS TABLE ──────────────────────────────────────────────────────
create table public.market_tiers (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  tier_key        text not null unique,
  labor_multiplier numeric(4,3) not null,
  description     text,
  examples        text,
  sort_order      int default 0,
  active          boolean default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id)
);
alter table public.market_tiers enable row level security;
create policy "Anyone authenticated can read market tiers"
  on public.market_tiers for select using (auth.role() = 'authenticated');
create policy "Only admins can modify market tiers"
  on public.market_tiers for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ─── PRICING SETTINGS TABLE ──────────────────────────────────────────────────
create table public.pricing_settings (
  id              uuid primary key default uuid_generate_v4(),
  key             text not null unique,
  value           text not null,
  label           text,
  description     text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id)
);
alter table public.pricing_settings enable row level security;
create policy "Anyone authenticated can read settings"
  on public.pricing_settings for select using (auth.role() = 'authenticated');
create policy "Only admins can modify settings"
  on public.pricing_settings for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ─── QUOTES TABLE ────────────────────────────────────────────────────────────
create table public.quotes (
  id              uuid primary key default uuid_generate_v4(),
  quote_number    text unique,
  client_name     text not null,
  client_zip      text,
  market_tier     text,
  package_name    text,
  status          text not null default 'draft' check (status in ('draft','sent','won','lost','expired')),
  inputs          jsonb not null default '{}',
  line_items      jsonb not null default '[]',
  totals          jsonb not null default '{}',
  hubspot_deal_id text,
  hubspot_deal_url text,
  notes           text,
  created_by      uuid references public.profiles(id),
  updated_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.quotes enable row level security;
create policy "All authenticated users can read quotes"
  on public.quotes for select using (auth.role() = 'authenticated');
create policy "All authenticated users can create quotes"
  on public.quotes for insert with check (auth.role() = 'authenticated');
create policy "All authenticated users can update quotes"
  on public.quotes for update using (auth.role() = 'authenticated');
create policy "Only admins can delete quotes"
  on public.quotes for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-generate quote numbers
create sequence if not exists quote_number_seq start 1000;
create or replace function public.set_quote_number()
returns trigger language plpgsql as $$
begin
  if new.quote_number is null then
    new.quote_number := 'FIT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quote_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
create trigger set_quote_number_trigger
  before insert on public.quotes
  for each row execute procedure public.set_quote_number();

-- ─── ACTIVITY LOG TABLE ──────────────────────────────────────────────────────
create table public.activity_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id),
  user_email  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  entity_name text,
  changes     jsonb,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create policy "Admins can read all activity"
  on public.activity_log for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "All authenticated users can insert activity"
  on public.activity_log for insert with check (auth.role() = 'authenticated');

-- ─── UPDATED_AT TRIGGERS ─────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger packages_updated_at before update on public.packages for each row execute procedure public.update_updated_at();
create trigger products_updated_at before update on public.products for each row execute procedure public.update_updated_at();
create trigger market_tiers_updated_at before update on public.market_tiers for each row execute procedure public.update_updated_at();
create trigger pricing_settings_updated_at before update on public.pricing_settings for each row execute procedure public.update_updated_at();
create trigger quotes_updated_at before update on public.quotes for each row execute procedure public.update_updated_at();

-- ─── SEED DATA ───────────────────────────────────────────────────────────────

-- Packages
insert into public.packages (name, ws_rate, user_rate, server_rate, location_rate, tenant_rate, included_vendors, vendor_rate, coverage, hrs_user, hrs_ws, hrs_server, hrs_location, ideal_desc, sort_order) values
('Business Essentials', 65, 24, 75, 150, 0,   2,  25, 'business_hours', 0.10, 0.25, 0.60, 0.75, '10–40 users · single-site · limited compliance', 1),
('Business Plus',       105, 44, 100, 150, 195, 5,  45, '24x5',          0.16, 0.35, 0.90, 1.10, '25–150 users · cloud · moderate compliance', 2),
('Enterprise',          140, 59, 150, 150, 395, 10, 65, '24x7',          0.22, 0.50, 1.25, 1.75, '100+ users · multi-site · regulated', 3);

-- Market Tiers
insert into public.market_tiers (name, tier_key, labor_multiplier, description, examples, sort_order) values
('Major Metro',        'major_metro',  1.00, 'Top metro areas — highest labor market rates', 'Chicago · NYC · LA · Dallas · Seattle · Boston · DC · Miami', 1),
('Mid-Market',         'mid_market',   0.90, 'Regional business hubs — moderate labor market', 'Minneapolis · Denver · Phoenix · Nashville · Columbus · Omaha', 2),
('Small Market / Rural','small_market', 0.80, 'Lower cost-of-living markets — competitive pricing', 'Rural Iowa · Montana · Wyoming · smaller Midwest cities', 3);

-- Pricing Settings
insert into public.pricing_settings (key, value, label, description) values
('burdened_hourly_rate',    '125',  'Burdened Hourly Rate ($)', 'Fully loaded hourly cost for service delivery'),
('min_commitment',          '350',  'Minimum Monthly Commitment ($)', 'Floor price for any managed IT engagement'),
('onboarding_min',          '500',  'Minimum Onboarding Fee ($)', 'Minimum one-time onboarding charge'),
('onboarding_per_user',     '35',   'Onboarding Per User ($)', 'One-time setup cost per human user'),
('onboarding_per_ws',       '20',   'Onboarding Per Workstation ($)', 'One-time setup cost per workstation'),
('onboarding_per_server',   '250',  'Onboarding Per Server ($)', 'One-time setup cost per server'),
('onboarding_per_location', '450',  'Onboarding Per Location ($)', 'One-time site survey and setup per location'),
('stack_cost_per_user',     '10',   'Stack Cost Per User ($)', 'Monthly tooling cost per user'),
('stack_cost_per_ws',       '20',   'Stack Cost Per Workstation ($)', 'Monthly tooling cost per workstation'),
('stack_cost_per_server',   '55',   'Stack Cost Per Server ($)', 'Monthly tooling cost per server'),
('stack_cost_per_tenant',   '99',   'Stack Cost Per Tenant ($)', 'Monthly tooling cost per cloud tenant'),
('contract_disc_12',        '0.05', '12-Month Contract Discount', 'Discount rate for 12-month commitments'),
('contract_disc_24',        '0.10', '24-Month Contract Discount', 'Discount rate for 24-month commitments'),
('contract_disc_36',        '0.20', '36-Month Contract Discount', 'Discount rate for 36-month commitments'),
('ep_uplift_moderate',      '14',   'Endpoint Density Uplift — Moderate ($/endpoint)', 'Extra endpoint pricing when ratio ≤ 1.75×'),
('ep_uplift_high',          '22',   'Endpoint Density Uplift — High ($/endpoint)', 'Extra endpoint pricing when ratio > 1.75×');

-- Products
insert into public.products (name, category, sub_category, description, sell_price, cost_price, qty_driver, exclusive_group, sort_order) values
-- Cloud & Email Security
('Cloud MDR — SaaSAlerts',        'Cloud & Email Security', null,        'M365/Google anomaly detection · all mailboxes', 5.00,  1.50, 'mailbox',     null,     1),
('INKY Essential',                'Cloud & Email Security', 'INKY',      'Phish Fence · Graymail · Attachment Scanning', 5.00,  2.77, 'user',        'inky',   2),
('INKY Advanced',                 'Cloud & Email Security', 'INKY',      'Essential + Internal Mail + Outbound Protection', 7.00, 4.37, 'user',       'inky',   3),
('INKY Encryption',               'Cloud & Email Security', 'INKY',      'Standalone email encryption add-on', 4.00, 0.80, 'user',        null,     4),
-- Endpoint Security
('SentinelOne Complete',          'Endpoint Security',      null,        'EDR · Cloud Workload Security', 12.00, 3.60, 'workstation', 'endpoint_sec', 1),
('ThreatLocker',                  'Endpoint Security',      null,        'Zero-trust application control', 15.00, 4.68, 'workstation', 'endpoint_sec', 2),
-- Backup & Recovery
('Backup & DR — Workstations',    'Backup & Recovery',      null,        'Per-workstation backup and disaster recovery', 15.00, 8.00, 'workstation', null, 1),
('Backup & DR — Servers',         'Backup & Recovery',      null,        'Per-server backup and disaster recovery', 95.00, 50.00, 'server',  null, 2),
-- Security Awareness
('Security Awareness Training',   'Security Awareness',     null,        'Per-user phishing simulation and training', 4.00, 2.00, 'user',       null, 1),
-- SIEM & SOC
('SIEM / Log Analytics',          'SIEM & SOC',             null,        'Per-user log collection and analytics', 24.00, 12.00, 'user',      null, 1),
('SOC / Threat Monitoring',       'SIEM & SOC',             null,        '24×7 threat detection and response', 34.00, 18.00, 'user',      null, 2),
-- Network & Connectivity
('Managed Firewall',              'Network & Connectivity', null,        'Per-location managed firewall', 215.00, 120.00, 'location', null, 1),
('Managed 5G Backup Internet',    'Network & Connectivity', null,        'Per-location 5G failover internet', 195.00, 110.00, 'location', null, 2),
('Domotz Network Monitoring',     'Network & Connectivity', null,        'Per-location network monitoring', 28.00, 28.00, 'location', null, 3),
-- Strategic Advisory
('vCIO / ITSO Advisory — Essentials', 'Strategic Advisory', 'vCIO',     'Virtual CIO advisory for Business Essentials clients', 750.00, 375.00, 'flat', 'vcio', 1),
('vCIO / ITSO Advisory — Business Plus', 'Strategic Advisory', 'vCIO',  'Virtual CIO advisory for Business Plus clients', 1000.00, 500.00, 'flat', 'vcio', 2),
('vCIO / ITSO Advisory — Enterprise',    'Strategic Advisory', 'vCIO',  'Virtual CIO advisory for Enterprise clients', 2000.00, 1000.00, 'flat', 'vcio', 3);

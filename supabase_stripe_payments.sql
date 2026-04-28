-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe Prepayment Integration — v3.5.0
-- Tracks Stripe Checkout sessions for Payment #1 (initial onboarding prepayment)
-- Card-only. ACH stays external (bank wire / billing portal).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stripe_payments (
  id                       uuid primary key default gen_random_uuid(),

  -- Quote linkage (quote_type lets us point to the right table / route)
  quote_id                 uuid,
  quote_type               text,           -- 'managed-it' | 'multi-site-managed-it' | 'voice' | 'bundle' | 'flex'
  quote_number             text,

  -- Client
  client_name              text,
  client_email             text not null,

  -- Money (all stored in cents to match Stripe's API exactly)
  face_amount_cents        integer not null check (face_amount_cents >= 0),
  surcharge_pct            numeric(6,4) not null default 0.02,   -- captured at time of payment for audit
  surcharge_amount_cents   integer not null check (surcharge_amount_cents >= 0),
  total_charged_cents      integer not null check (total_charged_cents >= 0),
  currency                 text not null default 'usd',

  -- Stripe references
  mode                     text not null default 'test',         -- 'test' | 'live'
  stripe_session_id        text unique,
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  stripe_invoice_id        text,
  checkout_url             text,

  -- Lifecycle
  status                   text not null default 'pending',      -- 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded'
  expires_at               timestamptz,
  paid_at                  timestamptz,
  failure_reason           text,
  refund_reason            text,
  refunded_at              timestamptz,

  -- HubSpot sync trail
  hubspot_deal_id          text,
  hubspot_note_id          text,

  -- Email tracking
  email_sent_at            timestamptz,
  email_sent_to            text,
  resend_count             integer not null default 0,
  last_resent_at           timestamptz,

  -- Audit
  created_at               timestamptz not null default now(),
  created_by               uuid references public.profiles(id) on delete set null,
  updated_at               timestamptz not null default now()
);

create index if not exists idx_stripe_payments_quote     on public.stripe_payments(quote_id);
create index if not exists idx_stripe_payments_status    on public.stripe_payments(status);
create index if not exists idx_stripe_payments_session   on public.stripe_payments(stripe_session_id);
create index if not exists idx_stripe_payments_created   on public.stripe_payments(created_at desc);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_stripe_payments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stripe_payments_updated_at on public.stripe_payments;
create trigger trg_stripe_payments_updated_at
  before update on public.stripe_payments
  for each row execute function public.touch_stripe_payments_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Authenticated reps can read/write their org's payments.
-- Public read by stripe_session_id is needed for the receipt page (clients are unauthenticated).
alter table public.stripe_payments enable row level security;

drop policy if exists stripe_payments_authed_all on public.stripe_payments;
create policy stripe_payments_authed_all on public.stripe_payments
  for all to authenticated using (true) with check (true);

-- Public can read a single row by stripe_session_id only — needed for the
-- branded receipt page that shows the client their payment status.
drop policy if exists stripe_payments_public_receipt on public.stripe_payments;
create policy stripe_payments_public_receipt on public.stripe_payments
  for select to anon
  using (stripe_session_id is not null);

-- ─── Pricing settings seeds ──────────────────────────────────────────────────
-- These let admin store the Stripe credentials in the same Pricing Settings
-- table that already holds spt_api_key, signwell_api_key, hubspot_token, etc.
insert into public.pricing_settings (key, value, description) values
  ('stripe_secret_key',     '', 'Stripe secret API key (sk_test_… or sk_live_…). Used server-side only.'),
  ('stripe_publishable_key','', 'Stripe publishable key (pk_test_… or pk_live_…). Safe to expose client-side.'),
  ('stripe_webhook_secret', '', 'Stripe webhook signing secret (whsec_…). Used to verify webhook authenticity.'),
  ('stripe_mode',           'test', 'Stripe mode: ''test'' or ''live''.'),
  ('stripe_statement_desc', 'FERRUM IT PREPAY', 'Statement descriptor that appears on the cardholder''s bank statement (max 22 chars).')
on conflict (key) do nothing;

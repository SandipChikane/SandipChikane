-- Single-level referral commissions, ledger, and withdrawals.
-- Additive and safe to run more than once. Does not drop existing tables or data.
-- Fresh installs: run admin-schema.sql, learning-sections.sql, then this file.

create extension if not exists pgcrypto;

create table if not exists public.referral_profiles (
  email text primary key,
  code text not null unique,
  status text not null default 'active',
  terms_version text,
  terms_accepted_at timestamptz,
  withdrawal_threshold_paise integer,
  withdrawal_threshold_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_profiles_code_check check (code ~ '^[A-Z2-9]{8,16}$'),
  constraint referral_profiles_status_check check (status in ('active', 'suspended'))
);

create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  referrer_email text not null,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referred_email text not null unique,
  referrer_email text not null,
  code text not null,
  locked boolean not null default true,
  attributed_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint referral_attributions_not_self check (referred_email <> referrer_email)
);

create table if not exists public.course_referral_settings (
  course_id text primary key references public.courses(id) on delete cascade,
  referral_enabled boolean not null default true,
  referral_active boolean not null default true,
  commission_source text not null default 'GLOBAL_DEFAULT',
  commission_type text not null default 'PERCENTAGE',
  fixed_commission_paise integer not null default 0,
  commission_percent_bps integer not null default 0,
  max_commission_paise integer not null default 0,
  min_order_value_paise integer not null default 0,
  holding_days integer,
  campaign_start timestamptz,
  campaign_end timestamptz,
  updated_at timestamptz not null default now(),
  constraint course_referral_source_check check (commission_source in ('GLOBAL_DEFAULT', 'PRODUCT_OVERRIDE')),
  constraint course_referral_type_check check (commission_type in ('FIXED_AMOUNT', 'PERCENTAGE')),
  constraint course_referral_fixed_check check (fixed_commission_paise >= 0),
  constraint course_referral_bps_check check (commission_percent_bps >= 0),
  constraint course_referral_max_check check (max_commission_paise >= 0),
  constraint course_referral_min_check check (min_order_value_paise >= 0)
);

create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referrer_email text not null,
  referred_email text not null,
  course_id text not null,
  provider_order_id text not null unique,
  provider_payment_id text,
  amount_paid_paise integer not null,
  list_price_paise integer not null,
  commission_type text not null,
  fixed_commission_paise integer not null default 0,
  percent_bps integer not null default 0,
  calculation_basis text not null,
  commission_paise integer not null,
  reversed_paise integer not null default 0,
  holding_days integer not null default 0,
  rule_version integer not null default 1,
  terms_version text,
  currency text not null default 'INR',
  status text not null default 'PENDING',
  fraud_hold boolean not null default false,
  review_required boolean not null default false,
  available_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_commissions_amount_check check (commission_paise >= 0),
  constraint referral_commissions_paid_check check (amount_paid_paise >= 0),
  constraint referral_commissions_not_self check (referrer_email <> referred_email),
  constraint referral_commissions_status_check check (status in (
    'PENDING', 'AVAILABLE', 'WITHDRAWAL_PENDING', 'PAID', 'REVERSED', 'REJECTED'
  )),
  constraint referral_commissions_basis_check check (calculation_basis in ('ACTUAL_AMOUNT_PAID', 'PRODUCT_LIST_PRICE')),
  constraint referral_commissions_type_check check (commission_type in ('FIXED_AMOUNT', 'PERCENTAGE')),
  constraint referral_commissions_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table if not exists public.referral_ledger (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  type text not null,
  direction text not null,
  amount_paise integer not null,
  currency text not null default 'INR',
  status text not null default 'posted',
  reference_type text,
  reference_id text,
  description text,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint referral_ledger_amount_check check (amount_paise >= 0),
  constraint referral_ledger_direction_check check (direction in ('credit', 'debit')),
  constraint referral_ledger_type_check check (type in (
    'REFERRAL_COMMISSION',
    'COMMISSION_REVERSAL',
    'WITHDRAWAL_REQUEST',
    'WITHDRAWAL_RESERVED',
    'WITHDRAWAL_COMPLETED',
    'WITHDRAWAL_RELEASED',
    'WITHDRAWAL_REJECTED',
    'REFUND_REVERSAL',
    'ADMIN_ADJUSTMENT',
    'CHARGEBACK_HOLD',
    'CHARGEBACK_REVERSAL'
  ))
);

create table if not exists public.referral_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  amount_paise integer not null,
  method text not null,
  status text not null default 'PENDING',
  idempotency_key text unique,
  admin_note text,
  provider_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_withdrawals_amount_check check (amount_paise > 0),
  constraint referral_withdrawals_method_check check (method in ('UPI', 'BANK')),
  constraint referral_withdrawals_status_check check (status in (
    'PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED'
  ))
);

create table if not exists public.referral_payout_accounts (
  email text primary key,
  method text not null,
  encrypted_payload text not null,
  fingerprint text,
  updated_at timestamptz not null default now(),
  constraint referral_payout_method_check check (method in ('UPI', 'BANK'))
);

create table if not exists public.referral_fraud_flags (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  related_email text,
  signal text not null,
  detail jsonb not null default '{}'::jsonb,
  open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_activity (
  id uuid primary key default gen_random_uuid(),
  referrer_email text not null,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_provider_events (
  provider text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create index if not exists referral_profiles_code_idx on public.referral_profiles (code);
create index if not exists referral_clicks_code_idx on public.referral_clicks (code, created_at desc);
create index if not exists referral_clicks_referrer_idx on public.referral_clicks (referrer_email, created_at desc);
create index if not exists referral_attributions_referrer_idx on public.referral_attributions (referrer_email);
create index if not exists referral_commissions_referrer_idx on public.referral_commissions (referrer_email, status, created_at desc);
create index if not exists referral_commissions_referred_idx on public.referral_commissions (referred_email);
create index if not exists referral_commissions_status_idx on public.referral_commissions (status, available_at);
create index if not exists referral_commissions_payment_idx on public.referral_commissions (provider_payment_id);
create index if not exists referral_ledger_user_idx on public.referral_ledger (user_email, created_at desc);
create index if not exists referral_withdrawals_user_idx on public.referral_withdrawals (user_email, status, created_at desc);
create index if not exists referral_payout_fingerprint_idx on public.referral_payout_accounts (fingerprint);
create index if not exists referral_fraud_open_idx on public.referral_fraud_flags (open, created_at desc);
create index if not exists referral_activity_referrer_idx on public.referral_activity (referrer_email, created_at desc);

alter table public.referral_profiles enable row level security;
alter table public.referral_clicks enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.course_referral_settings enable row level security;
alter table public.referral_commissions enable row level security;
alter table public.referral_ledger enable row level security;
alter table public.referral_withdrawals enable row level security;
alter table public.referral_payout_accounts enable row level security;
alter table public.referral_fraud_flags enable row level security;
alter table public.referral_activity enable row level security;
alter table public.payment_provider_events enable row level security;

revoke all on public.referral_profiles from anon, authenticated;
revoke all on public.referral_clicks from anon, authenticated;
revoke all on public.referral_attributions from anon, authenticated;
revoke all on public.course_referral_settings from anon, authenticated;
revoke all on public.referral_commissions from anon, authenticated;
revoke all on public.referral_ledger from anon, authenticated;
revoke all on public.referral_withdrawals from anon, authenticated;
revoke all on public.referral_payout_accounts from anon, authenticated;
revoke all on public.referral_fraud_flags from anon, authenticated;
revoke all on public.referral_activity from anon, authenticated;
revoke all on public.payment_provider_events from anon, authenticated;

grant all on public.referral_profiles to service_role;
grant all on public.referral_clicks to service_role;
grant all on public.referral_attributions to service_role;
grant all on public.course_referral_settings to service_role;
grant all on public.referral_commissions to service_role;
grant all on public.referral_ledger to service_role;
grant all on public.referral_withdrawals to service_role;
grant all on public.referral_payout_accounts to service_role;
grant all on public.referral_fraud_flags to service_role;
grant all on public.referral_activity to service_role;
grant all on public.payment_provider_events to service_role;

create table if not exists public.referral_admin_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'WITHDRAWAL_REQUEST',
  withdrawal_id uuid,
  user_email text not null,
  amount_paise integer not null default 0,
  method text,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint referral_admin_notices_kind_check check (kind in ('WITHDRAWAL_REQUEST')),
  constraint referral_admin_notices_status_check check (status in ('OPEN', 'READ')),
  constraint referral_admin_notices_amount_check check (amount_paise >= 0)
);

alter table public.referral_admin_notices enable row level security;
revoke all on public.referral_admin_notices from anon, authenticated;
grant all on public.referral_admin_notices to service_role;

create or replace function public.referral_lock_profile(p_email text)
returns void
language plpgsql
security definer
as $$
begin
  perform 1 from public.referral_profiles where email = p_email for update;
end;
$$;

create or replace function public.referral_available_paise(p_email text)
returns integer
language sql
stable
as $$
  select greatest(
    0,
    coalesce((
      select sum(greatest(0, commission_paise - coalesce(reversed_paise, 0))) from public.referral_commissions
      where referrer_email = p_email and status = 'AVAILABLE' and fraud_hold = false
    ), 0)
    -
    coalesce((
      select sum(amount_paise) from public.referral_withdrawals
      where user_email = p_email and status in ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING')
    ), 0)
  );
$$;

create or replace function public.referral_reserve_withdrawal(
  p_email text,
  p_amount integer,
  p_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  existing public.referral_withdrawals;
  reserved public.referral_withdrawals;
  available integer;
  threshold integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into existing from public.referral_withdrawals where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('replayed', true, 'id', existing.id, 'status', existing.status);
    end if;
  end if;

  perform 1 from public.referral_profiles where email = p_email for update;
  select coalesce(withdrawal_threshold_paise, 0) into threshold
    from public.referral_profiles
    where email = p_email;
  available := public.referral_available_paise(p_email);
  if threshold is null or threshold <= 0 or available < threshold then
    raise exception 'below_threshold' using errcode = 'P0001';
  end if;
  if available < p_amount then
    raise exception 'insufficient_available' using errcode = 'P0001';
  end if;

  insert into public.referral_withdrawals (user_email, amount_paise, method, status, idempotency_key)
  values (p_email, p_amount, p_method, 'PENDING', p_idempotency_key)
  returning * into reserved;

  insert into public.referral_ledger (
    user_email, type, direction, amount_paise, currency, status, reference_type, reference_id, description, idempotency_key
  ) values (
    p_email, 'WITHDRAWAL_RESERVED', 'debit', p_amount, 'INR', 'posted', 'withdrawal', reserved.id::text,
    'Withdrawal reserved from available earnings', 'reserve:' || reserved.id::text
  );

  return jsonb_build_object('replayed', false, 'id', reserved.id, 'status', reserved.status);
end;
$$;

revoke all on function public.referral_lock_profile(text) from anon, authenticated;
revoke all on function public.referral_available_paise(text) from anon, authenticated;
revoke all on function public.referral_reserve_withdrawal(text, integer, text, text) from anon, authenticated;
grant execute on function public.referral_lock_profile(text) to service_role;
grant execute on function public.referral_available_paise(text) to service_role;
grant execute on function public.referral_reserve_withdrawal(text, integer, text, text) to service_role;

-- Additive follow-up for the fixed 20% referral rate and withdrawal threshold.
-- Safe to run more than once. Does not drop existing tables or rewrite history.

alter table public.referral_profiles
  add column if not exists withdrawal_threshold_paise integer,
  add column if not exists withdrawal_threshold_set_at timestamptz;

alter table public.referral_withdrawals
  add column if not exists provider_reference text;

alter table public.referral_commissions
  add column if not exists reversed_paise integer not null default 0;

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

create index if not exists referral_admin_notices_open_idx
  on public.referral_admin_notices (status, created_at desc);

alter table public.referral_admin_notices enable row level security;
revoke all on public.referral_admin_notices from anon, authenticated;
grant all on public.referral_admin_notices to service_role;

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

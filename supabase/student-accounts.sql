-- Student login accounts. Passwords are stored as scrypt hashes only.
-- Apply with the database password (service_role cannot run DDL).

create table if not exists public.student_accounts (
  email text primary key,
  password_hash text not null,
  name text,
  college text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_accounts enable row level security;

revoke all on table public.student_accounts from anon, authenticated;
grant all on table public.student_accounts to service_role;

drop policy if exists "student_accounts_no_anon" on public.student_accounts;
create policy "student_accounts_no_anon"
  on public.student_accounts
  for all
  to anon, authenticated
  using (false)
  with check (false);

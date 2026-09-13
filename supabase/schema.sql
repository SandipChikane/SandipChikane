-- Run this in the Supabase SQL editor for the Gradflow project.
-- The service role key bypasses RLS. Anon clients have no table policies.

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_email text not null,
  student_name text,
  college text,
  course_id text not null,
  course_name text not null,
  paid boolean not null default true,
  razorpay_order_id text,
  razorpay_payment_id text,
  enrolled_at timestamptz not null default now(),
  unique (student_email, course_id)
);

create index if not exists enrollments_college_idx on public.enrollments (college);
create index if not exists enrollments_email_idx on public.enrollments (student_email);

create or replace view public.tpo_enrollments as
  select
    id,
    student_email,
    student_name,
    college,
    course_id,
    course_name,
    paid,
    enrolled_at
  from public.enrollments;

alter table public.enrollments enable row level security;
alter view public.tpo_enrollments set (security_invoker = true);

revoke all on public.enrollments from anon, authenticated;
revoke all on public.tpo_enrollments from anon, authenticated;
grant all on public.enrollments to service_role;
grant select on public.tpo_enrollments to service_role;

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

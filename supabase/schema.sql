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

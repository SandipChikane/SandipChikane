-- Gradflow admin CMS. Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.courses (
  id text primary key,
  name text not null,
  category text not null default 'analytics',
  weeks integer not null default 8,
  price integer not null default 0,
  blurb text,
  tools text[] not null default '{}',
  project text,
  cover_image_url text,
  thumbnail_url text,
  promo_video_url text,
  lesson jsonb,
  status text not null default 'draft',
  featured boolean not null default false,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_status_check check (status in ('draft', 'published', 'archived')),
  constraint courses_id_check check (id ~ '^[a-z0-9-]+$')
);

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  number text,
  title text not null,
  duration text,
  description text,
  sort_order integer not null default 0
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references public.course_modules(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  number text,
  type text,
  title text not null,
  minutes integer,
  copy text,
  video_url text,
  image_url text,
  resource_url text,
  resource_label text,
  allow_download boolean not null default false,
  is_current boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null unique,
  public_url text not null,
  kind text not null,
  title text,
  course_id text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint media_kind_check check (kind in ('image', 'video', 'file'))
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists courses_status_idx on public.courses (status, sort_order);
create index if not exists course_modules_course_idx on public.course_modules (course_id, sort_order);
create index if not exists course_lessons_course_idx on public.course_lessons (course_id, sort_order);
create index if not exists media_assets_kind_idx on public.media_assets (kind, created_at desc);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.media_assets enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_audit enable row level security;

revoke all on public.courses from anon, authenticated;
revoke all on public.course_modules from anon, authenticated;
revoke all on public.course_lessons from anon, authenticated;
revoke all on public.media_assets from anon, authenticated;
revoke all on public.site_settings from anon, authenticated;
revoke all on public.admin_audit from anon, authenticated;

grant all on public.courses to service_role;
grant all on public.course_modules to service_role;
grant all on public.course_lessons to service_role;
grant all on public.media_assets to service_role;
grant all on public.site_settings to service_role;
grant all on public.admin_audit to service_role;

-- Learning sections, lesson content, and progress live in learning-sections.sql.
-- Referral commissions, ledger, and withdrawals live in referral-schema.sql.

-- Course → Learning Section → Module → Lesson
-- Additive and safe to run more than once. Does not delete courses, enrollments, or lessons.

create extension if not exists pgcrypto;

create table if not exists public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  title text not null,
  slug text not null,
  short_description text,
  full_description text,
  thumbnail_url text,
  icon text,
  sort_order integer not null default 0,
  status text not null default 'draft',
  estimated_minutes integer not null default 0,
  prerequisite_section_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_sections_status_check check (status in ('draft', 'published')),
  constraint course_sections_slug_check check (slug ~ '^[a-z0-9-]+$'),
  constraint course_sections_course_slug unique (course_id, slug)
);

alter table public.course_modules
  add column if not exists section_id uuid references public.course_sections(id) on delete cascade;

alter table public.course_modules
  add column if not exists updated_at timestamptz not null default now();

alter table public.course_lessons
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.lesson_content (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  kind text not null default 'copy',
  body text,
  media_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_content_kind_check check (kind in ('copy', 'video', 'image', 'resource', 'quiz', 'project', 'assignment'))
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_email text not null,
  course_id text not null references public.courses(id) on delete cascade,
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  status text not null default 'completed',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_progress_status_check check (status in ('started', 'completed')),
  constraint lesson_progress_unique unique (student_email, lesson_id)
);

create index if not exists course_sections_course_idx on public.course_sections (course_id, sort_order);
create index if not exists course_modules_section_idx on public.course_modules (section_id, sort_order);
create index if not exists lesson_content_lesson_idx on public.lesson_content (lesson_id, sort_order);
create index if not exists lesson_progress_student_idx on public.lesson_progress (student_email, course_id);
create index if not exists lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

alter table public.course_sections enable row level security;
alter table public.lesson_content enable row level security;
alter table public.lesson_progress enable row level security;

revoke all on public.course_sections from anon, authenticated;
revoke all on public.lesson_content from anon, authenticated;
revoke all on public.lesson_progress from anon, authenticated;

grant all on public.course_sections to service_role;
grant all on public.lesson_content to service_role;
grant all on public.lesson_progress to service_role;

-- Existing courses keep their modules and lessons. Each course with syllabus
-- but no section yet gets one published section titled from the course itself.
insert into public.course_sections (course_id, title, slug, short_description, status, sort_order, estimated_minutes)
select
  c.id,
  c.name,
  'course-path',
  coalesce(c.blurb, ''),
  'published',
  0,
  coalesce((
    select sum(coalesce(l.minutes, 0))
    from public.course_lessons l
    where l.course_id = c.id
  ), 0)
from public.courses c
where not exists (
  select 1 from public.course_sections s where s.course_id = c.id
)
and (
  exists (select 1 from public.course_modules m where m.course_id = c.id)
  or exists (select 1 from public.course_lessons l where l.course_id = c.id)
);

update public.course_modules m
set section_id = s.id
from public.course_sections s
where s.course_id = m.course_id
  and m.section_id is null;

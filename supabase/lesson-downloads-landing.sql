-- Per-lesson student download control. Default off.
-- Additive and safe to run more than once. Landing copy uses existing site_settings.

alter table public.course_lessons
  add column if not exists allow_download boolean not null default false;

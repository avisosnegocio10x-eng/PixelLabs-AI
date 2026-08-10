begin;

alter table public.content_ideas
    add column if not exists platform social_platform,
    add column if not exists planned_for timestamptz,
    add column if not exists plan_key text,
    add column if not exists metadata jsonb not null default '{}';

create unique index if not exists content_ideas_plan_key_unique
    on public.content_ideas (plan_key);

create unique index if not exists content_ideas_platform_time_unique
    on public.content_ideas (platform, planned_for)
    where platform is not null
      and planned_for is not null
      and status in ('PROPOSED', 'SELECTED');

create index if not exists content_ideas_calendar_idx
    on public.content_ideas (planned_for, platform, status)
    where planned_for is not null;

commit;

-- The Lead Generation CRM's Agent Performance Score moves its reporting
-- period from Monday-Sunday to Monday-Friday (the target itself is
-- unchanged: 4 appointments booked per agent per week). Every previously
-- frozen Monday-Sunday row is preserved untouched for historical
-- reporting - none are deleted or rewritten - and is retroactively
-- labeled definition_version 1. Weeks frozen from now on
-- (leadgen-performance-history-sync.ts) are written under
-- definition_version 2, so a legacy Mon-Sun row can never be misread as
-- one of the new Mon-Fri weeks (its week_end reflects the old 7-day
-- window, not the new 5-day one).
alter table public.leadgen_agent_weekly_performance
  add column if not exists definition_version integer;

update public.leadgen_agent_weekly_performance
set definition_version = 1
where definition_version is null;

alter table public.leadgen_agent_weekly_performance
  alter column definition_version set default 2,
  alter column definition_version set not null,
  drop constraint if exists leadgen_agent_weekly_performance_unique;

alter table public.leadgen_agent_weekly_performance
  add constraint leadgen_agent_weekly_performance_unique
  unique (agent_id, week_start, definition_version);

comment on column public.leadgen_agent_weekly_performance.definition_version is
  '1 = legacy Monday-Sunday reporting week; 2 = current Monday-Friday reporting week.';

-- The Growth CRM's Agent Performance Score Gauge moves from a biweekly,
-- five-metric model to a Monday-Friday weekly model tracking exactly three
-- verified metrics: opportunity leads added, emails delivered, and
-- consultations booked (weekly targets 12/12/4). Renaming the ledger table
-- only relabels it going forward - every previously frozen row
-- (definition_version 1 = legacy stage-derived, 2 = biweekly verified
-- events) is preserved untouched for historical reporting, per the "don't
-- delete the database" requirement. New rows are written under
-- definition_version 3 by crm-performance-history-sync.ts.
alter table public.crm_agent_biweekly_performance rename to crm_agent_weekly_performance;

alter table public.crm_agent_weekly_performance
  add column if not exists leads_added integer,
  add column if not exists leads_added_target integer,
  add column if not exists leads_added_percentage integer,
  add column if not exists emails_delivered integer,
  add column if not exists emails_delivered_target integer,
  add column if not exists emails_delivered_percentage integer,
  alter column definition_version set default 3;

comment on table public.crm_agent_weekly_performance is
  'Permanent, append-only ledger of each Growth CRM agent''s completed reporting period. definition_version 1-2 rows are legacy biweekly periods (never rewritten); definition_version 3+ rows are the current Monday-Friday weekly periods.';

comment on column public.crm_agent_weekly_performance.leads_added is
  'Opportunity Leads Added (definition_version 3+): opportunities created in the Monday-Friday period, weekly target 12. Null on legacy rows.';
comment on column public.crm_agent_weekly_performance.emails_delivered is
  'Emails Delivered (definition_version 3+): every Resend-confirmed delivered email credited to the agent in the Monday-Friday period, weekly target 12. Null on legacy rows.';
comment on column public.crm_agent_weekly_performance.consultations_booked is
  'Consultations Booked: confirmed winsalot_appointments booking in the period. Biweekly target 4 through definition_version 2; weekly target 4 from definition_version 3 on.';

comment on column public.crm_agent_weekly_performance.qualified_opportunities is
  'Legacy only (definition_version 1-2): Opportunities Added under the old biweekly definition. Superseded by leads_added under the weekly definition (version 3+).';
comment on column public.crm_agent_weekly_performance.proposals_sent is
  'Legacy only (definition_version 1-2): Emails Delivered under the old biweekly definition. Superseded by emails_delivered under the weekly definition (version 3+).';
comment on column public.crm_agent_weekly_performance.applications_submitted is
  'Legacy only (definition_version 1-2). Funding Applications Submitted is no longer part of the Growth CRM Agent Performance Score.';
comment on column public.crm_agent_weekly_performance.clients_won is
  'Legacy only (definition_version 1-2). Clients Won is no longer part of the Growth CRM Agent Performance Score.';

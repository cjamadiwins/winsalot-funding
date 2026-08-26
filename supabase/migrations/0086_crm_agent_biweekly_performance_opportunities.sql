-- Repoints the Agent Performance Report's permanent biweekly ledger
-- (crm_agent_biweekly_performance, migration 0052) from the retired
-- "quotes sent/received" metrics to the five Winsalot Growth CRM metrics
-- (consultations booked, qualified opportunities, applications submitted,
-- proposals sent, clients won). The old quotes_* columns are made
-- nullable rather than dropped (no historical row is deleted or has data
-- destroyed - see the "don't delete the database" requirement); new rows
-- frozen going forward only ever populate the new columns.
alter table public.crm_agent_biweekly_performance
  alter column quotes_sent drop not null,
  alter column quotes_sent_target drop not null,
  alter column quotes_sent_percentage drop not null,
  alter column quotes_received drop not null,
  alter column quotes_received_target drop not null,
  alter column quotes_received_percentage drop not null,
  add column if not exists consultations_booked integer,
  add column if not exists consultations_booked_target integer,
  add column if not exists consultations_booked_percentage integer,
  add column if not exists qualified_opportunities integer,
  add column if not exists qualified_opportunities_target integer,
  add column if not exists qualified_opportunities_percentage integer,
  add column if not exists applications_submitted integer,
  add column if not exists applications_submitted_target integer,
  add column if not exists applications_submitted_percentage integer,
  add column if not exists proposals_sent integer,
  add column if not exists proposals_sent_target integer,
  add column if not exists proposals_sent_percentage integer,
  add column if not exists clients_won integer,
  add column if not exists clients_won_target integer,
  add column if not exists clients_won_percentage integer;

-- Per-call-list call script attachment (both CRMs).
--
-- Additive only: two nullable columns on call_list_segments.
--   call_script_key  Growth CRM: which built-in service/campaign script template
--                    the list uses (the same six keys as the dashboard Quick Call
--                    Script). NULL for Lead Generation lists.
--   call_script_text Optional custom script Admin can write/update at any time
--                    from the list page, no deploy needed. When set it replaces
--                    the template (Growth) or the client's script (Lead Gen) for
--                    this list only.
-- Agents read these only through the existing segment RLS, i.e. only for lists
-- they are currently assigned to (and, per the earlier policies, eligible for), so
-- removing an agent from a list/client/service removes their access to its
-- script. Call logs, leads, opportunities and appointments never reference these
-- columns, so changing a script never alters history. No new grants: the table's
-- existing privileges and policies already cover new columns.

alter table public.call_list_segments
  add column if not exists call_script_key text,
  add column if not exists call_script_text text;

alter table public.call_list_segments
  drop constraint if exists call_list_segments_call_script_key_check;
alter table public.call_list_segments
  add constraint call_list_segments_call_script_key_check
  check (call_script_key is null or call_script_key in (
    'website-development', 'marketing-agencies', 'bookkeeping-accounting',
    'it-services', 'security-systems', 'business-finance'
  ));

-- Map existing Growth lists to their current campaign script (only where unset).
update public.call_list_segments
set call_script_key = 'website-development'
where crm = 'growth' and call_script_key is null
  and growth_opportunity_type = 'lead_generation'
  and (name ilike 'website design%' or campaign_name ilike '%website%');

update public.call_list_segments
set call_script_key = 'business-finance'
where crm = 'growth' and call_script_key is null
  and growth_opportunity_type = 'business_financing';

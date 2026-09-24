-- Client Portal, Phase 3 (follow-up to 20260924214016): logs an
-- "opportunity_outcome_changed" activity whenever a client_outcome
-- actually changes on leadgen_client_opportunities, regardless of who
-- changed it (client via the Pipeline page, or Admin) - a client session
-- has no INSERT policy on leadgen_lead_activities at all
-- (leadgen_lead_activities_agent_insert_own_lead is agent-only), so this
-- can't be done from application code and needs a SECURITY DEFINER
-- trigger, the same pattern as sync_leadgen_appointment_opportunity().
create or replace function public.log_leadgen_opportunity_outcome_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.client_outcome is distinct from new.client_outcome then
    insert into public.leadgen_lead_activities (lead_id, activity_type, notes)
    values (new.lead_id, 'opportunity_outcome_changed', 'Outcome changed from "' || old.client_outcome || '" to "' || new.client_outcome || '".');
  end if;
  return new;
end;
$$;

drop trigger if exists leadgen_opportunity_outcome_activity_trigger on public.leadgen_client_opportunities;
create trigger leadgen_opportunity_outcome_activity_trigger
  after update of client_outcome on public.leadgen_client_opportunities
  for each row execute function public.log_leadgen_opportunity_outcome_change();

revoke execute on function public.log_leadgen_opportunity_outcome_change() from public, anon, authenticated;

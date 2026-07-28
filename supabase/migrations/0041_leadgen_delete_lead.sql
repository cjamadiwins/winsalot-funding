-- LeadGen lead deletion helper: remove one lead and only the records
-- that belong to that exact lead, atomically, so the admin UI can fail
-- cleanly instead of partially deleting data if a constraint blocks the
-- operation.

create or replace function public.leadgen_delete_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row record;
  deleted_followups integer := 0;
  deleted_appointments integer := 0;
  deleted_activities integer := 0;
  deleted_emails integer := 0;
begin
  if public.leadgen_user_role(auth.uid()) <> 'admin' then
    raise exception 'Only admins can delete leads.' using errcode = '42501';
  end if;

  select id, business_name
    into lead_row
    from public.leadgen_leads
   where id = p_lead_id;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  delete from public.leadgen_followups where lead_id = p_lead_id;
  get diagnostics deleted_followups = row_count;

  delete from public.leadgen_appointments where lead_id = p_lead_id;
  get diagnostics deleted_appointments = row_count;

  delete from public.leadgen_lead_activities where lead_id = p_lead_id;
  get diagnostics deleted_activities = row_count;

  delete from public.leadgen_emails where lead_id = p_lead_id;
  get diagnostics deleted_emails = row_count;

  delete from public.leadgen_leads where id = p_lead_id;

  if not found then
    raise exception 'Lead was already removed.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'business_name', lead_row.business_name,
    'deleted_followups', deleted_followups,
    'deleted_appointments', deleted_appointments,
    'deleted_activities', deleted_activities,
    'deleted_emails', deleted_emails
  );
exception
  when foreign_key_violation then
    raise exception 'Unable to delete this lead because related records are protected by database constraints.' using errcode = '23503';
  when others then
    raise exception '%', sqlerrm using errcode = sqlstate;
end;
$$;

revoke execute on function public.leadgen_delete_lead(uuid) from public, anon;
grant execute on function public.leadgen_delete_lead(uuid) to authenticated;
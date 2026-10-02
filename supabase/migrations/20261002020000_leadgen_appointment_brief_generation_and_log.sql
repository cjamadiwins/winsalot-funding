-- Lead Generation CRM: Prepare Appointment - generated client brief + email log.
--
-- Additive only. No existing row is touched, and no policy or grant changes:
-- leadgen_appointment_briefs keeps its table-level grants/RLS (Admin select,
-- client select of their own SENT brief; every write is service_role), and
-- leadgen_emails keeps leadgen_emails_admin_all / agent / client policies.
--
-- 1. leadgen_appointment_briefs.main_interest / primary_need - two more
--    client-visible brief fields (e.g. "Website Redesign / SEO" and "Generate
--    more leads from search ..."). The existing interest_level (High / Medium /
--    Early Interest) is unchanged.
-- 2. leadgen_emails.brief_appointment_id - links a sent Appointment Brief email
--    to its appointment WITHOUT using leadgen_emails.appointment_id, which the
--    appointment confirmation / reminder status badges read. Those badges and
--    records are therefore never affected by a brief email.
-- 3. leadgen_lead_activities: 'appointment_brief_sent' activity type, shown as
--    "Appointment brief sent." (the production list + client_notified + this).
--    set_leadgen_client_activity_summary() is the production definition plus
--    one extra case for it.

alter table public.leadgen_appointment_briefs
  add column if not exists main_interest text,
  add column if not exists primary_need text;

alter table public.leadgen_emails
  add column if not exists brief_appointment_id uuid references public.leadgen_appointments(id) on delete set null;

create index if not exists leadgen_emails_brief_appointment_idx
  on public.leadgen_emails(brief_appointment_id, created_at desc)
  where brief_appointment_id is not null;

alter table public.leadgen_lead_activities
  drop constraint if exists leadgen_lead_activities_activity_type_check;
alter table public.leadgen_lead_activities
  add constraint leadgen_lead_activities_activity_type_check
    check (activity_type = ANY (ARRAY[
      'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
      'follow_up_scheduled', 'follow_up_completed', 'appointment_booked', 'appointment_updated',
      'consultation_email_sent', 'consultation_invitation_sent', 'consultation_follow_up_sent',
      'appointment_confirmation_resent', 'appointment_reminder_sent', 'appointment_reminder_auto_sent',
      'appointment_business_reminder_auto_sent',
      'mantra_collab_intro_sent', 'web6_solutions_intro_sent', 'teknokraft_intro_sent', 'hidebrandt_intro_sent',
      'opportunity_created', 'opportunity_outcome_changed',
      'client_notified',
      'appointment_brief_sent'
    ]::text[]));

create or replace function public.set_leadgen_client_activity_summary()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.activity_type in ('note', 'lead_assigned', 'lead_reassigned', 'client_notified') then
    new.client_visible := false;
    new.client_summary := null;
    return new;
  end if;

  new.client_visible := true;
  new.client_summary := case new.activity_type
    when 'call' then case
      when new.call_outcome is not null then 'Call completed — ' || lower(new.call_outcome) || '.'
      else 'Call completed.'
    end
    when 'email' then 'Email sent.'
    when 'status_change' then 'Lead status updated.'
    when 'follow_up_scheduled' then 'Follow-up scheduled.'
    when 'follow_up_completed' then 'Follow-up completed.'
    when 'appointment_booked' then 'Appointment booked.'
    when 'appointment_updated' then 'Appointment details updated.'
    when 'consultation_email_sent' then 'Consultation information sent by email.'
    when 'consultation_invitation_sent' then 'Consultation invitation sent by email.'
    when 'consultation_follow_up_sent' then 'Follow-up email sent.'
    when 'appointment_confirmation_resent' then 'Appointment confirmation sent again.'
    when 'appointment_reminder_sent' then 'Appointment reminder sent.'
    when 'appointment_reminder_auto_sent' then 'Automatic appointment reminder sent.'
    when 'mantra_collab_intro_sent' then 'Introduction email sent.'
    when 'opportunity_created' then 'Consultation completed — added to your pipeline.'
    when 'opportunity_outcome_changed' then 'Pipeline outcome updated.'
    when 'appointment_brief_sent' then 'Appointment brief sent.'
    else 'Lead activity updated.'
  end;
  return new;
end;
$function$;

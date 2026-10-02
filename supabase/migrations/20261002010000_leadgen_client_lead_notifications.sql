-- Lead Generation CRM: "Email Client" lead notifications.
--
-- Admin can notify a client from a lead record. The send reuses the existing
-- tracked email pipeline (leadgen_emails + Resend webhook), so no new table,
-- policy or grant is needed: leadgen_emails_admin_all already covers the
-- admin insert/select, and leadgen_lead_activities_admin_all covers the
-- timeline entry. Purely additive; no existing row is touched.
--
-- 1. leadgen_emails.notification_type - the admin-selected reason (Interested
--    Lead, Proposal Requested, ...). Null for every other email, which is how
--    prospect-facing status views tell a client notification apart from an
--    email to the lead itself.
-- 2. leadgen_lead_activities.activity_type - allow 'client_notified' (the
--    constraint below is the production list plus that one value).
-- 3. set_leadgen_client_activity_summary() - 'client_notified' is an internal
--    handoff entry, so it is kept private exactly like 'note'. Without this
--    it would fall into the function's ELSE branch and be mirrored to the
--    client portal as "Lead activity updated.". Body is the production
--    definition with that one value added to the internal list.

alter table public.leadgen_emails
  add column if not exists notification_type text;

alter table public.leadgen_emails
  drop constraint if exists leadgen_emails_notification_type_check;
alter table public.leadgen_emails
  add constraint leadgen_emails_notification_type_check
    check (notification_type is null or notification_type in (
      'interested_lead', 'proposal_requested', 'appointment_requested',
      'callback_follow_up', 'additional_information', 'custom'
    ));

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
      'client_notified'
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
    else 'Lead activity updated.'
  end;
  return new;
end;
$function$;

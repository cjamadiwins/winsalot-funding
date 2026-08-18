-- Lead Generation CRM: adds "Resend Appointment Notification" and "Send
-- Appointment Reminder" as distinctly-logged activity types, so the
-- activity timeline can tell them apart from the original booking email
-- (brief: "Record each resend and reminder in the activity log"). Purely
-- additive, same pattern as migration 0032 - widens
-- leadgen_lead_activities.activity_type and leaves every existing value
-- untouched, so nothing that already logs an activity is affected.

alter table public.leadgen_lead_activities
  drop constraint leadgen_lead_activities_activity_type_check;

alter table public.leadgen_lead_activities
  add constraint leadgen_lead_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
    'follow_up_scheduled', 'follow_up_completed', 'appointment_booked',
    'appointment_updated', 'consultation_email_sent',
    'consultation_invitation_sent', 'consultation_follow_up_sent',
    'appointment_confirmation_resent', 'appointment_reminder_sent'
  ));

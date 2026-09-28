-- Lead Generation CRM: three new lead-activity types for the
-- website-services clients' own campaign intro emails (Web6 Solutions,
-- Teknokraft Canada Inc., Hidebrandt Web Services), following the exact
-- same one-client-one-hardcoded-intro-email pattern already established
-- for Mantra Collab ('mantra_collab_intro_sent'). Purely additive: widens
-- the existing check constraint with three more allowed values, touches
-- no existing rows.

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
      'opportunity_created', 'opportunity_outcome_changed'
    ]::text[]));

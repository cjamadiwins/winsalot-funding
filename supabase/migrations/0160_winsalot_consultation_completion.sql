-- Growth CRM only: "Complete Consultation" action on winsalot_appointments
-- - lets an admin or the assigned agent explicitly mark a consultation as
-- completed after the call takes place. Never automatic, never triggered
-- by appointment time simply passing (see performWinsalotCompletion,
-- src/lib/winsalot-consultation-completion.ts) - a staff member always has
-- to click the button. Adds a symmetric 'no_show' terminal status for the
-- complementary case. A rescheduled appointment stays 'booked' (it's still
-- scheduled, just moved to a new time - see performWinsalotReschedule), so
-- no separate 'rescheduled' status is added here; the appointment's own
-- Reschedule history is already visible on the linked opportunity's
-- Activity Timeline via the existing 'consultation_rescheduled' entries.

alter table public.winsalot_appointments drop constraint if exists winsalot_appointments_status_check;
alter table public.winsalot_appointments add constraint winsalot_appointments_status_check
  check (status in ('booked', 'cancelled', 'completed', 'no_show'));

alter table public.winsalot_appointments
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_user_id uuid references public.crm_users(id) on delete set null,
  -- Snapshot of the completing user's name at the moment "Complete
  -- Consultation" was clicked - kept even if that crm_users row is later
  -- hard-deleted (the agent "Remove" action, not just deactivation), so
  -- "Completed By" never goes blank on an old record.
  add column if not exists completed_by_name text,
  add column if not exists no_show_at timestamptz,
  add column if not exists no_show_by_user_id uuid references public.crm_users(id) on delete set null,
  add column if not exists no_show_by_name text,
  -- One-time consultation follow-up email, triggered only by "Complete
  -- Consultation" - never by the automatic reminder job, and never for a
  -- cancelled or no-show appointment. The transition to 'sending' happens
  -- inside the same request that flips status to 'completed' (a guarded
  -- compare-and-swap update keyed on the appointment currently being
  -- 'booked'), so a second click - or two concurrent requests - can never
  -- re-send it; see performWinsalotCompletion.
  add column if not exists follow_up_email_status text not null default 'not_sent'
    check (follow_up_email_status in ('not_sent', 'sending', 'sent', 'failed')),
  add column if not exists follow_up_email_sent_at timestamptz,
  add column if not exists follow_up_crm_lead_email_id uuid references public.crm_lead_emails(id) on delete set null;

-- New activity-timeline entries for the two new terminal states - purely
-- additive, same pattern as every prior extension of this constraint.
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'consultation_booked', 'consultation_rescheduled', 'consultation_cancelled',
    'client_created', 'client_updated', 'client_archived', 'client_reactivated',
    'client_deleted', 'client_agent_assigned', 'client_agent_unassigned',
    'invoice_created', 'invoice_sent', 'invoice_reminder_sent', 'invoice_cancelled',
    'invoice_archived', 'payment_recorded', 'payment_reversed',
    'agreement_sent', 'agreement_signed', 'agreement_superseded',
    'intake_sent', 'intake_received', 'onboarding_invoice_recorded',
    'onboarding_payment_received', 'campaign_activated',
    'pilot_activated', 'pilot_results_review_started', 'pilot_converted',
    'pilot_extended', 'pilot_closed', 'pilot_results_recorded',
    'onboarding_record_updated', 'onboarding_record_deleted',
    'email_resubscribed',
    'consultation_completed', 'consultation_no_show'
  ));

-- New tracked-email type for the one-time consultation follow-up send, so
-- it shows up in crm_lead_emails / Email Tracking / the Resend webhook
-- pipeline exactly like every other Growth CRM email.
alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in ('quote_request', 'follow_up', 'provider_intake', 'consultation_invite', 'appointment_reminder', 'appointment_confirmation', 'consultation_follow_up'));

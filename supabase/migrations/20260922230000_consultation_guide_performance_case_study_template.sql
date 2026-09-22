-- Growth CRM Client Consultation Guide: a third scoped follow-up email
-- template value, "performance_case_study" - for a prospect whose main
-- objection is trust/proof of performance before committing (for now,
-- The Creative Horse / Mustafa). Same additive, prospect-scoped pattern
-- migration 20260921170000 used to add "pricing_next_steps" - every
-- existing guide (null/'standard'/'pricing_next_steps') is completely
-- unaffected, and application code (buildFollowUpEmailDraft in
-- src/lib/consultation-guide-email.ts) only ever builds this template for
-- a guide row that explicitly has follow_up_email_template =
-- 'performance_case_study' set on it.
--
-- Same drop+recreate technique this codebase already uses to widen a
-- check constraint (crm_activities_exactly_one_target, etc.) - every
-- value the constraint already accepted (including null) remains
-- accepted.

alter table public.crm_consultation_guides drop constraint if exists crm_consultation_guides_follow_up_email_template_check;
alter table public.crm_consultation_guides add constraint crm_consultation_guides_follow_up_email_template_check
  check (follow_up_email_template is null or follow_up_email_template in ('standard', 'pricing_next_steps', 'performance_case_study'));

comment on column public.crm_consultation_guides.follow_up_email_template is
  'Which follow-up email template generates this guide''s draft - null/''standard'' (every existing guide, and every new one unless explicitly changed) is the plain service-specific template; ''pricing_next_steps'' is the Unique Web World Digital Marketing-style template asking for portfolio/positioning material ahead of a standard-rate campaign; ''performance_case_study'' is the The Creative Horse/Mustafa-style template pairing the custom_split_payment arrangement fields with a fixed Previous Campaign Experience (case study) section. See buildFollowUpEmailDraft in src/lib/consultation-guide-email.ts.';

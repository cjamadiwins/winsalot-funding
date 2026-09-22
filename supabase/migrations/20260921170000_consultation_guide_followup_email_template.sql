-- Growth CRM Client Consultation Guide: which follow-up email TEMPLATE a
-- guide's draft is generated from - independent of arrangement_type
-- (Commercial Arrangement is about pricing/payment structure; this is
-- about which prospect-specific email copy is used). Added for Unique
-- Web World Digital Marketing, which needs a "Pricing & Next Steps" email
-- asking for portfolio/positioning material before outreach can start,
-- still at Winsalot Corp.'s standard $750/month rate (arrangement_type
-- stays 'standard_monthly' - no pilot, discount, or custom arrangement).
--
-- Purely additive and default-preserving: the new column is nullable, and
-- application code (see src/lib/consultation-guide-email.ts's
-- buildFollowUpEmailDraft) treats null/'standard' identically - the
-- existing, unmodified service-specific template every other consultation
-- already gets. No existing column, row, policy, or trigger is altered.
-- crm_opportunities does not need this column: the Follow-Up Email
-- section lives only on the consultation guide, never on the business
-- record.

alter table public.crm_consultation_guides
  add column if not exists follow_up_email_template text
    check (follow_up_email_template is null or follow_up_email_template in ('standard', 'pricing_next_steps'));

comment on column public.crm_consultation_guides.follow_up_email_template is
  'Which follow-up email template generates this guide''s draft - null/''standard'' (every existing guide, and every new one unless explicitly changed) is the plain service-specific template; ''pricing_next_steps'' is the Unique Web World Digital Marketing-style template asking for portfolio/positioning material ahead of a standard-rate campaign. See buildFollowUpEmailDraft in src/lib/consultation-guide-email.ts.';

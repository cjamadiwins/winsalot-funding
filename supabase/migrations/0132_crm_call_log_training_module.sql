-- Growth CRM: add a "Call Logs - How and Why to Use Them" module to the
-- existing Winsalot Training Portal (migration 0105), so it appears
-- automatically in both Agent Onboarding (the required curriculum) and
-- the standalone Winsalot Training library - both already read from the
-- same crm_training_modules/crm_training_module_versions tables, so one
-- new active+required module is all it takes; nothing else changes.
--
-- Appended after the existing 14 modules (sort_order 15) - purely
-- additive, no existing module row is touched.

insert into public.crm_training_modules (slug, title, sort_order, is_required, is_active, current_version) values
  ('call-logs-how-and-why', 'Call Logs — How and Why to Use Them', 15, true, true, 1)
on conflict (slug) do nothing;

insert into public.crm_training_module_assignments (module_id, assigned_role)
select id, 'agent' from public.crm_training_modules where slug = 'call-logs-how-and-why'
on conflict (module_id, assigned_role) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Call Logs — How and Why to Use Them', $json$
{
  "learningObjective": "Understand when a Call Log is required, how to fill one out correctly in the Growth CRM, and why accurate Call Logs matter for tracking agent activity and performance.",
  "explanation": "Call Logs are required for tracking agent activity and call outcomes, especially for calls that do not become a lead or opportunity. Every relevant outbound call should be logged whenever it is not already captured by the normal Lead/Opportunity workflow - this gives Winsalot a complete, honest record of the work being done, not just the calls that happened to turn into something.\n\nWhy Call Logs Are Important. Call Logs help Winsalot:\n- measure real agent activity\n- see how many businesses were actually contacted\n- understand call outcomes\n- identify excessive short calls or low-quality activity\n- track callbacks\n- compare performance by agent\n- compare performance by client\n- coach agents using real activity data\n- create more accurate performance reports\n- maintain accountability without forcing every call to become a lead\n\nCall Logs do not replace Leads or Opportunities. If a business becomes interested, qualified, or needs follow-up as a real prospect, you should still create or update the normal Lead/Opportunity record - the Call Log tracks the call itself, it is not a substitute for the sales pipeline.",
  "steps": [
    "Log a Call Log for every relevant outbound call that is not already captured by a Lead or Opportunity.",
    "Check the Business / Client field - in the Growth CRM this is always Winsalot Corp. and is filled in automatically, so there is nothing to select.",
    "Enter or copy the correct business name and the phone number for the business you actually called.",
    "Select the correct quick outcome: No Answer, Voicemail, Gatekeeper, Not Interested, or Callback.",
    "Add a short note when it is useful - for example, extra context for a callback or something worth remembering.",
    "If the business becomes interested, qualified, or needs real follow-up, still create or update the Lead/Opportunity - a Call Log does not replace that."
  ],
  "examples": [
    "Example: You call ABC Restaurant while prospecting for Winsalot Corp. Nobody answers. Create a Call Log with Business/Client = Winsalot Corp., enter ABC Restaurant and the phone number, and select \"No Answer.\""
  ],
  "approvedPhrases": [
    "\"No answer, will try again this afternoon.\"",
    "\"Left a voicemail introducing Winsalot Corp.\"",
    "\"Spoke briefly with a gatekeeper; asked for the owner's name and the best callback time.\""
  ],
  "phrasesToAvoid": [
    "\"Called, nothing.\" (too vague to be useful later)",
    "Leaving the note blank when a callback or extra context would help.",
    "Skipping the Call Log because the call did not turn into a lead."
  ],
  "commonMistakes": [
    "Skipping the Call Log because the call did not turn into a lead or opportunity - these calls are exactly what Call Logs are for.",
    "Selecting the wrong quick outcome or leaving it inaccurate.",
    "Leaving out useful context that would help a teammate or admin understand what happened.",
    "Treating the Call Log as a replacement for creating or updating a real Lead/Opportunity record."
  ],
  "keyReminders": [
    "A Call Log does not replace a Lead or Opportunity - if the business is a real prospect, use the normal Lead/Opportunity workflow too.",
    "In the Growth CRM, Business/Client is always Winsalot Corp. - you never need to select it.",
    "Consistent, accurate Call Logs give Winsalot a much better picture of your work than call volume alone."
  ],
  "summary": "Call Logs track every relevant outbound call - including ones that do not become a lead or opportunity - so Winsalot can measure real activity, understand outcomes, and coach and report on performance accurately. In the Growth CRM, Business/Client is always Winsalot Corp.; just enter the business name, phone number, and outcome, and add a note when useful. Call Logs work alongside the Lead/Opportunity workflow, not instead of it."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'call-logs-how-and-why'
on conflict (module_id, version) do nothing;

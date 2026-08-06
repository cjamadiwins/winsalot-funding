-- Adds a fourth Sales Training & Call Scripts entry: a general CTA
-- (Call to Action) lesson on clearly directing an interested prospect to
-- the next step instead of ending the call vaguely. Same table/RLS as the
-- existing seeded scripts (migrations 0018, 0021, 0025) - agents can view
-- and copy, only admins can edit or remove. No category set, so it groups
-- with the existing uncategorized scripts under the default "General
-- Training" heading, same as migrations 0018/0021/0025.
--
-- The CTA here is the cleaning-specific next step (completing the
-- cleaning quote request), reusing the same QUOTE_REQUEST_URL link/label
-- as migration 0025's card - not the Lead Generation CRM's consultation
-- booking CTA, which is a separate, unrelated seed in that campaign only.

insert into public.crm_training_materials (title, content, sort_order, link_url, link_label) values (
  'CTA (Call to Action) — How to Move a Prospect to the Next Step',
  'WHAT IS A CTA?
CTA means "Call to Action." It is the specific next action we want the prospect to take after speaking with us. For this campaign, the CTA is completing (or requesting) the cleaning quote - not just expressing interest.

DURING THE CALL
Do not simply end the conversation by saying:
"Okay, we''ll send you some information."

Instead, clearly explain what the prospect should do next.

Example:
"Great. I''ll send the cleaning quote request now. Please check your email and follow the link/button to complete it."

ASK THEM TO CHECK THEIR EMAIL
When appropriate, say:
"Would you be able to check your email while I have you on the phone?"

If they can, guide them to open the email and complete the quote request together.

IF THEY SAY "SEND ME THE INFORMATION"
Say:
"Absolutely. I''ll send it over now. Please check your email for the link/button and follow it to complete your cleaning quote request when you''re ready."

FOLLOW-UP CALL
If the prospect has not completed the CTA:
"Hi, this is [Agent Name] following up on the cleaning quote request we sent. I just wanted to make sure you received it. Were you able to see the link?"

If they received it:
"No problem. If you''re still interested, you can use the link we sent to complete your cleaning quote request."

GOLDEN RULE
Before ending an interested conversation, ask yourself:
"Does the prospect know exactly what I want them to do next?"

THE PROCESS
Create Interest -> Explain Next Step -> Send CTA -> Follow Up -> Get the Prospect to Complete the CTA.',
  3,
  'https://cleaning.winsalotcorp.com',
  'Open Quote Request Form'
);

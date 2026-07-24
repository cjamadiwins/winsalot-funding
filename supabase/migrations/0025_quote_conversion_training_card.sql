-- Adds an optional call-to-action link to crm_training_materials, then seeds
-- a third Sales Training & Call Scripts entry that uses it: a script on
-- converting an already-interested lead into a submitted quote request,
-- with a button linking straight to the live quote-request form.
--
-- link_url/link_label are both nullable - existing entries (migrations 0018,
-- 0021) are unaffected and simply render without a button, same as today.

alter table public.crm_training_materials
  add column if not exists link_url text,
  add column if not exists link_label text;

insert into public.crm_training_materials (title, content, sort_order, link_url, link_label) values (
  'How to Convert an Interested Lead Into a Quote Request',
  'The goal is not only to identify interest. The goal is to complete the quote request.

1. Call the lead as soon as possible
Contact every new lead the same day whenever possible.

2. Ask for a clear commitment
Say:
"I''ll send the cleaning quote request now. Can you complete it today so we can prepare pricing?"

3. Send the link while still on the call
Ask the customer to confirm they received the email before ending the call.

4. Offer to complete it with them
Say:
"It only takes about two minutes. I can help you complete it over the phone now."

With the customer''s permission, the agent may enter the information and submit the quote request on the customer''s behalf.

5. Schedule follow-ups
- First follow-up: later the same day
- Second follow-up: the next morning
- Final follow-up: within 48 hours

Follow-up script:
"Hi, this is [Agent Name] from Winsalot Corp. I''m following up on the cleaning quote request we sent. It only takes about two minutes to complete. Would you like me to help you complete it now over the phone?"

Important:
An interested lead is not yet a completed result. The objective is a submitted quote request.',
  2,
  'https://cleaning.winsalotcorp.com',
  'Open Quote Request Form'
);

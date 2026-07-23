-- Adds a second Sales Training & Call Scripts entry: a follow-up script
-- for agents calling a client who was already sent a cleaning quote
-- request link but hasn't completed it yet. Same table/RLS as the first
-- seeded script (migration 0018) - agents can view and copy, only admins
-- can edit or remove.

insert into public.crm_training_materials (title, content, sort_order) values (
  'Cleaning Quote Request Follow-Up Script',
  'Agent:

"Hi, is this [Client Name] from [Business Name]?"

"Hi [Client Name], this is [Agent Name] calling from Winsalot Corp. We recently sent you a link to complete a cleaning quote request."

"I''m just following up to make sure you received it. Were you able to open the link?"

If they received it but have not completed it:

"No problem. It should only take a few minutes. Once you complete it, we can arrange a customized cleaning quote based on your location and cleaning needs."

"Would you be able to complete it today, or would you prefer that I resend the link?"

If they want the link resent:

"Perfect. I''ll resend it now. Please let us know once it has been completed so we can move forward with your quote."

If they have questions:

"Absolutely. What questions do you have about the quote request or cleaning service?"

Closing:

"Thank you, [Client Name]. We look forward to receiving your request and arranging the quote for you."

Voicemail version:

"Hi [Client Name], this is [Agent Name] calling from Winsalot Corp. I''m following up regarding the cleaning quote-request link we sent you. Please complete the short form when convenient so we can arrange your customized quote. We can also resend the link if needed. Thank you."',
  1
);

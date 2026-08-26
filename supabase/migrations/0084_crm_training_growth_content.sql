-- Reseeds the CRM's Sales Training & Call Scripts content for Winsalot
-- Growth CRM. Updates the four existing rows seeded by migrations
-- 0018/0019/0020, 0021, 0025, and 0053 in place (matched by their current
-- title) rather than deleting and re-inserting, so their ids - and any
-- future reference to them - are preserved.
--
-- The two cards that linked to the now-retired public cleaning quote form
-- (migrations 0025/0053) have their link_url/link_label cleared rather
-- than repointed, since there's no direct Growth CRM equivalent of a
-- single public intake form to link to.

update public.crm_training_materials
set
  title = 'General Winsalot Growth CRM Call Script',
  content = '"Hi, is this [Business Name]?"

"Great, my name is [Agent Name], calling from Winsalot Corp."

"We help businesses grow through lead generation services and business financing support - whichever fits what you''re working on right now."

"Are you currently open to a quick conversation about growing your customer base or accessing financing for your business?"

If yes:

"Perfect. I just need a few details so we can figure out the best fit for you."'
where title = 'General Commercial Cleaning Call Script';

update public.crm_training_materials
set
  title = 'Prospect Follow-Up Script',
  content = 'Agent:

"Hi, is this [Contact Name] from [Business Name]?"

"Hi [Contact Name], this is [Agent Name] calling from Winsalot Corp. We spoke recently about [lead generation / business financing] for your business."

"I''m just following up to see where things stand. Do you have a couple of minutes?"

If they''re still interested but haven''t taken the next step:

"No problem. It only takes a few minutes to get you set up. Once we have a few details, we can move forward with a consultation."

"Would now work, or would you prefer I call back at a better time?"

If they have questions:

"Absolutely. What questions do you have about the service or the process?"

Closing:

"Thank you, [Contact Name]. We look forward to helping your business grow."

Voicemail version:

"Hi [Contact Name], this is [Agent Name] calling from Winsalot Corp. I''m following up on our conversation about growing your business. Please call us back when convenient so we can get you set up. Thank you."'
where title = 'Cleaning Quote Request Follow-Up Script';

update public.crm_training_materials
set
  title = 'How to Convert an Interested Prospect Into a Booked Consultation',
  content = 'The goal is not only to identify interest. The goal is to book a consultation or get an application started.

1. Call the prospect as soon as possible
Contact every new prospect the same day whenever possible.

2. Ask for a clear commitment
Say:
"Let''s get a consultation scheduled now so we can go over exactly how this would work for your business."

3. Book the consultation while still on the call
Confirm the date and time together before ending the call.

4. Offer to help right away
Say:
"It only takes a couple of minutes. I can walk you through the next steps right now."

With the prospect''s permission, the agent may collect the required details and move the opportunity forward on the prospect''s behalf.

5. Schedule follow-ups
- First follow-up: later the same day
- Second follow-up: the next morning
- Final follow-up: within 48 hours

Follow-up script:
"Hi, this is [Agent Name] from Winsalot Corp. I''m following up on the consultation we discussed. Would you like me to help you get that scheduled now?"

Important:
An interested prospect is not yet a won client. The objective is a booked consultation or a submitted application.',
  link_url = null,
  link_label = null
where title = 'How to Convert an Interested Lead Into a Quote Request';

update public.crm_training_materials
set
  title = 'CTA (Call to Action) — How to Move a Prospect to the Next Step',
  content = 'WHAT IS A CTA?
CTA means "Call to Action." It is the specific next action we want the prospect to take after speaking with us. For Winsalot Growth CRM, the CTA is booking a consultation or starting an application - not just expressing interest.

DURING THE CALL
Do not simply end the conversation by saying:
"Okay, we''ll send you some information."

Instead, clearly explain what the prospect should do next.

Example:
"Great. Let''s get a consultation booked now so we can go over the details together."

CONFIRM THE NEXT STEP
When appropriate, say:
"Does [date/time] work for a quick consultation?"

If they agree, confirm the details together before ending the call.

IF THEY SAY "SEND ME THE INFORMATION"
Say:
"Absolutely. I''ll send it over now. In the meantime, let''s go ahead and get a consultation on the calendar so we don''t lose momentum."

FOLLOW-UP CALL
If the prospect has not taken the next step:
"Hi, this is [Agent Name] following up on the consultation we discussed. I just wanted to make sure we get you scheduled. Does [date/time] still work?"

GOLDEN RULE
Before ending an interested conversation, ask yourself:
"Does the prospect know exactly what I want them to do next?"

THE PROCESS
Create Interest -> Explain Next Step -> Book the Consultation -> Follow Up -> Get the Prospect to Complete the CTA.',
  link_url = null,
  link_label = null
where title = 'CTA (Call to Action) — How to Move a Prospect to the Next Step';

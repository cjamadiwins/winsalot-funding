-- Adds a fourth Sales Training & Call Scripts entry: how to handle the
-- common "we already have cleaners" objection from businesses. Same
-- crm_training_materials table/RLS as the earlier seeded scripts
-- (migrations 0018, 0021, 0025) - agents can view and copy, only admins
-- can edit or remove.

insert into public.crm_training_materials (title, content, sort_order) values (
  'Handling the "We Already Have Cleaners" Objection',
  'When speaking with businesses, avoid asking:

❌ "Do you need cleaning?"

Instead, use this consultative approach:

"I''m not calling to ask you to replace your current cleaning company. We work with businesses that like having a reliable backup or a competitive quote before renewal. Would you be open to a free, no-obligation quote for comparison?"

Why this works:

Most businesses already have a cleaning company. Our objective is not to convince them to cancel their current provider during the first call. Instead, we position Winsalot Corp as a reliable backup option and offer a free, no-obligation comparison quote.

This changes the conversation from replacing an existing cleaning company to comparing options and planning ahead.

Agent Tips:
- Never argue if they already have cleaners.
- Acknowledge that having a cleaning company is normal.
- Emphasize that many businesses keep a backup provider for emergencies, staff shortages, or contract renewals.
- Focus on providing value through a free, no-obligation quote.
- Maintain a friendly, professional, and consultative tone throughout the conversation.',
  3
);

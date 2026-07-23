-- Tweaks the seeded script's self-introduction line to speak on behalf of
-- "one of our commercial cleaning providers" rather than "a commercial
-- cleaning provider" - forward-fixes the row again, same pattern as 0019.

update public.crm_training_materials
set
  content = replace(
    content,
    'Great, my name is [Agent Name], calling from Winsalot Corp on behalf of a commercial cleaning provider.',
    'Great, my name is [Agent Name], calling from Winsalot Corp on behalf of one of our commercial cleaning providers.'
  )
where title = 'General Commercial Cleaning Call Script';

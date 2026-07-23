-- Renames the seeded call script and generalizes its industry-specific
-- sentence so it reads as suitable for any industry, not just property
-- management. Forward-fixes the row migration 0018 seeded, rather than
-- editing 0018 in place, matching this repo's existing pattern for
-- correcting an already-applied migration (see 0014, which fixed 0012's
-- function forward instead of rewriting it).

update public.crm_training_materials
set
  title = 'General Commercial Cleaning Call Script',
  content = replace(
    content,
    'We are reaching out to property management companies that may need cleaning services for offices, apartment buildings, common areas, move-ins, move-outs, or managed properties.',
    'We are reaching out to businesses that may need reliable commercial cleaning services for offices, buildings, common areas, move-ins, move-outs, or other commercial spaces.'
  )
where title = 'Property Management Cleaning Call Script';

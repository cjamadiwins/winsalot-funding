-- Removes a hard-coded branding leftover from the original single-client
-- setup: the `source` column's default and any rows that already used it
-- both said 'Afsoon Cleaning Team landing page'. This is a tracking label
-- on request rows, not customer or provider data, so it's safe to update
-- in place. Run this once against an existing database that already
-- applied 0003 with the old default; a fresh install picks up the
-- corrected default directly from 0003 and doesn't need this file.

alter table public.quote_requests
  alter column source set default 'Cleaning Quote Request';

update public.quote_requests
set source = 'Cleaning Quote Request'
where source = 'Afsoon Cleaning Team landing page';

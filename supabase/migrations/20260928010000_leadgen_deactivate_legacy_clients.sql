-- Retain the client and campaign IDs and every historical record. The existing
-- active flag controls new work; Admin can reactivate the same rows later.
update public.leadgen_clients
set active = false, updated_at = now()
where slug in ('brentsessentials', 'mantra-collab')
  and active = true;

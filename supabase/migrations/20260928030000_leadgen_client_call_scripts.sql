-- Lead Generation CRM: Client Call Script (brief "Client Call Script").
--
-- Each active client gets its own customized outbound call script,
-- visible to Admin and every Agent. Reuses the existing leadgen_clients
-- table (one client = one call script, exactly like one client already
-- has one booking_link/services_info_link) rather than a new table - no
-- new RLS/GRANTs are required since the existing policies already fit
-- perfectly:
--   - leadgen_clients_admin_all (migration 0031) already lets Admin
--     insert/update/delete every column on this table, including these
--     five - satisfies "Admin must be able to edit these fields."
--   - leadgen_clients_agent_select (migration 0031) already lets every
--     agent SELECT every client row - satisfies "Agents may view and use
--     them" - and, since agents have no UPDATE/INSERT/DELETE policy on
--     this table at all, they structurally cannot modify the script,
--     satisfying "should not be able to modify the approved script"
--     without any new policy.
--   - leadgen_clients_client_select_own is unaffected either way - the
--     Client Portal's own pages never select or render these columns
--     (same existing convention as the pre-existing internal `notes`
--     column on this same table).
--
-- All five columns are nullable free text - a client with none of them
-- set yet still renders a safe, generic default script (see
-- lib/leadgen-call-script.ts's buildLeadgenCallScript()), so this is
-- purely additive and never breaks an existing client record.
alter table public.leadgen_clients
  add column if not exists call_script_value_proposition text,
  add column if not exists call_script_services text,
  add column if not exists call_script_closing text,
  add column if not exists call_script_notes text,
  add column if not exists call_script_override text;

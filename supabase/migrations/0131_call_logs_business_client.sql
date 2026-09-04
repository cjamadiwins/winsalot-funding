-- Add the required "Business / Client" relationship to Call Logs.
--
-- Growth CRM: agents prospect solely on Winsalot Corp.'s own behalf - there
-- is no external paying client involved (crm_clients are Winsalot's own
-- signed customers, an unrelated concept, and are deliberately NOT
-- referenced here, nor is crm_opportunities/the cold-call prospect being
-- dialed). The Business/Client is therefore always the fixed value
-- "Winsalot Corp." - not a selectable field, just persisted per row and
-- pinned by a check constraint so it can never be anything else, even via
-- a direct API call that bypasses the read-only UI.
--
-- Lead Generation CRM: agents cold-call prospects on behalf of one of
-- Winsalot's own paying leadgen_clients, so the Business/Client is that
-- client and must be explicitly selected per call. `client_id` is added as
-- a real foreign key into the CRM's existing `leadgen_clients` table (no
-- duplicate business table, matching that table's naming convention). It's
-- required for every *new* row via a NOT VALID check constraint - enforced
-- on every future insert/update, but never re-validated against existing
-- historical rows, so this migration can never fail on data that predates
-- the field.
--
-- Neither table's existing `business_name` column changes - that remains
-- the free-text name of the actual prospect/business being called, a
-- distinct concept from the client the agent is calling on behalf of.

alter table public.crm_call_logs
  add column if not exists business_client_name text not null default 'Winsalot Corp.';

alter table public.crm_call_logs
  drop constraint if exists crm_call_logs_business_client_name_fixed;

alter table public.crm_call_logs
  add constraint crm_call_logs_business_client_name_fixed
  check (business_client_name = 'Winsalot Corp.');

alter table public.leadgen_call_logs
  add column if not exists client_id uuid references public.leadgen_clients(id) on delete restrict;

create index if not exists leadgen_call_logs_client_id_idx
  on public.leadgen_call_logs(client_id);

alter table public.leadgen_call_logs
  drop constraint if exists leadgen_call_logs_client_id_required;

alter table public.leadgen_call_logs
  add constraint leadgen_call_logs_client_id_required
  check (client_id is not null) not valid;

-- Prospect proposals: a personalized proposal (and its covering email) prepared
-- on a client's behalf for one lead. The structured content is stored on the
-- lead's record; the PDF is rendered from it on demand, so the downloaded and
-- the emailed PDF are always identical. A proposal starts as a DRAFT for Admin
-- review and is only emailed when an Admin sends it.
--
-- Admin-only: agents and client logins have no access to drafts.

create table if not exists public.leadgen_prospect_proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leadgen_leads(id),
  client_id uuid not null references public.leadgen_clients(id),
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  title text not null,
  content jsonb not null,
  email_to text not null,
  email_subject text not null,
  email_body text not null,
  attachment_filename text not null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  prepared_by uuid references public.leadgen_users(id) on delete set null,
  prepared_at timestamptz not null default now(),
  sent_by uuid references public.leadgen_users(id) on delete set null,
  sent_at timestamptz,
  sent_email_id uuid references public.leadgen_emails(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open draft per lead (re-preparing updates it).
create unique index if not exists leadgen_prospect_proposals_one_draft_per_lead
  on public.leadgen_prospect_proposals (lead_id) where status = 'draft';
create index if not exists leadgen_prospect_proposals_lead_idx on public.leadgen_prospect_proposals (lead_id, created_at desc);

alter table public.leadgen_prospect_proposals enable row level security;

drop policy if exists leadgen_prospect_proposals_admin_all on public.leadgen_prospect_proposals;
create policy leadgen_prospect_proposals_admin_all on public.leadgen_prospect_proposals
  for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

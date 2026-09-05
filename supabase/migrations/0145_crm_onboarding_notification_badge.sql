-- Growth CRM: admin sidebar notification badge for Client Onboarding,
-- matching the existing Leave Requests / Client Agreements / Client
-- Intake badges (the latter two already reuse crm_notifications.is_read
-- - see migration 0102 and src/app/admin/(dashboard)/layout.tsx).
--
-- Client Onboarding's dashboard (src/app/admin/(dashboard)/crm/onboarding)
-- is a derived view over crm_client_agreements, not a separate
-- submissions table, so there is no existing "reviewed" flag to reuse for
-- it specifically. onboarding_reviewed_at is intentionally its own column,
-- independent of:
--   - crm_notifications (Client Agreements' / Client Intake's own badge
--     source - a signed/reviewed agreement and an
--     acknowledged-on-the-onboarding-dashboard agreement are different
--     events for a different page), and
--   - admin_reviewed_confirmation (migration ~0099, already means
--     something else entirely: the admin confirming a draft's terms
--     before sending it to the client for signature).
--
-- Purely additive - no existing table, column, row, policy, or trigger is
-- dropped or rewritten.
alter table public.crm_client_agreements
  add column if not exists onboarding_reviewed_at timestamptz;

-- Backfill every existing record as reviewed so this migration does not
-- suddenly surface a large notification count for historical data - the
-- badge should represent new onboarding activity after this deploy, not
-- the entire book of existing clients.
update public.crm_client_agreements
  set onboarding_reviewed_at = now()
  where onboarding_reviewed_at is null;

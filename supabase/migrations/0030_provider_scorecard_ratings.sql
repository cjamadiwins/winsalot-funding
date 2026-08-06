-- Provider Scorecard: administrator-editable performance ratings, merged
-- into the existing automatic Provider Scorecard (migration 0028's
-- score/score_label/score_breakdown, computed by
-- recalculateProviderScore()) rather than a second card or table. Both
-- live on the same `cleaning_providers` row and render inside the same
-- ProviderScorecardCard - the automatic score/breakdown/adjustments
-- system is completely untouched by this migration.
--
-- Purely additive, nullable/defaulted columns: every existing row
-- (including providers like Afsoon Cleaning Team that predate this
-- feature) automatically gets a blank/default manual scorecard the
-- moment this migration runs, with no data migration or backfill step
-- and no existing column, row, or value modified.
alter table public.cleaning_providers
  add column if not exists quote_response_speed_rating smallint check (quote_response_speed_rating is null or quote_response_speed_rating between 1 and 5),
  add column if not exists pricing_competitiveness_rating smallint check (pricing_competitiveness_rating is null or pricing_competitiveness_rating between 1 and 5),
  add column if not exists service_quality_rating smallint check (service_quality_rating is null or service_quality_rating between 1 and 5),
  add column if not exists reliability_rating smallint check (reliability_rating is null or reliability_rating between 1 and 5),
  add column if not exists communication_rating smallint check (communication_rating is null or communication_rating between 1 and 5),
  add column if not exists customer_satisfaction_rating smallint check (customer_satisfaction_rating is null or customer_satisfaction_rating between 1 and 5),
  add column if not exists jobs_assigned_count integer not null default 0 check (jobs_assigned_count >= 0),
  add column if not exists quotes_submitted_count integer not null default 0 check (quotes_submitted_count >= 0),
  add column if not exists quotes_approved_count integer not null default 0 check (quotes_approved_count >= 0),
  add column if not exists jobs_completed_count integer not null default 0 check (jobs_completed_count >= 0),
  add column if not exists cancellation_no_show_count integer not null default 0 check (cancellation_no_show_count >= 0),
  add column if not exists scorecard_notes text,
  -- Overall Provider Score (brief item 1) - derived purely from the six
  -- 1-5 ratings above (average / 5 * 100, rounded), written by the
  -- admin-only updateOperationalScorecardAction alongside the ratings
  -- themselves. Deliberately a separate column from the existing
  -- `score`/`score_label` (the automatic activity-based score) so
  -- neither system's stored value is ever overwritten by the other.
  add column if not exists manual_score smallint check (manual_score is null or manual_score between 0 and 100),
  add column if not exists manual_score_label text check (manual_score_label is null or manual_score_label in (
    'Excellent', 'Good', 'Needs Improvement', 'High Risk'
  )),
  add column if not exists manual_score_updated_at timestamptz,
  add column if not exists manual_score_updated_by uuid references public.crm_users(id) on delete set null;

-- No RLS changes: cleaning_providers_admin_all / _agent_select_own /
-- _agent_update_own (migration 0028) already draw the correct
-- row-ownership boundary for these new columns. "Agents may view but
-- not edit" the scorecard is enforced the same way every other
-- admin-only action on this table already is (assignOperationalAgentAction,
-- updateOperationalStatusAction, deleteOperationalProviderAction, etc.) -
-- by the update action existing only in the admin server-action file,
-- never in the agent one - not by a column-level RLS restriction.

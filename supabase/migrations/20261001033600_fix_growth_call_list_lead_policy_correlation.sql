-- Matches the applied Supabase migration. Correct only the outer lead
-- correlation; preserve every existing policy and restrictive guard.
DO $fix$
DECLARE
  p record;
  condition text;
  check_condition text;
  changed integer := 0;
BEGIN
  FOR p IN SELECT policyname, qual, with_check FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_list_leads'
      AND policyname IN ('call_list_leads_growth_agent_select', 'call_list_leads_growth_agent_update')
  LOOP
    IF strpos(p.qual, '(s.id = sa.segment_id)') = 0 THEN
      RAISE EXCEPTION 'Unexpected policy definition: %', p.policyname;
    END IF;
    condition := replace(p.qual, '(s.id = sa.segment_id)', '(s.id = call_list_leads.segment_id)');
    IF p.policyname = 'call_list_leads_growth_agent_update' THEN
      IF strpos(p.with_check, '(s.id = sa.segment_id)') = 0 THEN
        RAISE EXCEPTION 'Unexpected WITH CHECK definition';
      END IF;
      check_condition := replace(p.with_check, '(s.id = sa.segment_id)', '(s.id = call_list_leads.segment_id)');
      EXECUTE format('ALTER POLICY %I ON public.call_list_leads USING (%s) WITH CHECK (%s)', p.policyname, condition, check_condition);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.call_list_leads USING (%s)', p.policyname, condition);
    END IF;
    changed := changed + 1;
  END LOOP;
  IF changed <> 2 THEN RAISE EXCEPTION 'Expected exactly two policies'; END IF;
END
$fix$;

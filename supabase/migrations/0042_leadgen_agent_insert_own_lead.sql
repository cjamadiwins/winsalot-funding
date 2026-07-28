-- Agents can create new leads, but only assigned to themselves.
-- Keeps admin behavior unchanged and preserves agent isolation.
create policy "leadgen_leads_agent_insert_own"
  on public.leadgen_leads for insert
  with check (
    assigned_agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
  );

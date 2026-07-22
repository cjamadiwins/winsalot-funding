-- Small follow-up: active_cleaning_opportunities_set_updated_at (migration
-- 0012) was missing `set search_path = public`, unlike its two sibling
-- functions in the same migration - flagged by Supabase's security
-- advisor (function_search_path_mutable). This only tightens the
-- function's own search_path; it doesn't change its behavior (still just
-- sets new.updated_at = now()) or touch any table, row, or policy.
create or replace function public.active_cleaning_opportunities_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

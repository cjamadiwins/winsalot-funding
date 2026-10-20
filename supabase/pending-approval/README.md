# Pending approval - NOT applied to production

SQL in this folder has been written and rehearsed on a throwaway database but has **not** been
applied to the production Supabase project. It lives outside `supabase/migrations/` on purpose, so
merging a branch can never apply it by accident (for example through a Supabase GitHub integration or
a CLI push).

After the owner approves it separately: move the file into `supabase/migrations/` (same name), apply
it to production in a quiet window, then re-run the Supabase advisors.

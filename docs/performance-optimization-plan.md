# Supabase request reduction - findings, changes and how to verify

Branch: `claude/vigilant-sagan-tpkbtw-perf`. **Nothing here is deployed.** Each change is its own
commit so any one can be dropped or reverted without touching the others.

## What the traffic looks like (measured 2026-10-20, last 24 h of Supabase API logs)

42,269 requests, all from the Vercel servers (user agent `node`), 72 errors. The busiest endpoints are
not page data - they are the same few lookups repeated by background check-ins:

| Source | What it costs per run (counted from the code) | Runs per day (from logs) |
|---|---|---|
| Lead Gen script-status heartbeat (`reportLeadgenScriptStateAction`, every 60 s per agent with a script open) | about 13 requests: 2 Auth, user row, segment x2, campaign x2, client x2, campaign roster, segment roster, status read, status write | about 915 |
| Attendance check-in (`pollLeadgenAgentActivityAction`, every 30 s per clocked-in agent) | about 4-5 requests: 2 Auth, user row, open shift, optional update | about 1,340 |
| Page loads / navigations (layout: notifications, chat unread, open shift, time zone) | about 8-10 each, already de-duplicated per render with `cache()` | about 680 |

So roughly a third of all requests come from the heartbeat, another sixth from the attendance check-in.
Growth CRM (`/agent`) has equivalent actions and benefits the same way.

Things that are **already well optimized** and left alone: per-render auth is memoized
(`getCachedAuthUser`, `requireLeadgenUser`), the time-zone preferences helper reuses it, notifications
refresh only on tab focus with a cooldown (no 25 s loop), Realtime is limited to chat/announcements
tables.

## Changes on this branch (in commit order)

1. **Proxy: no Auth-server lookup for Server Actions.** Every branch of the proxy session gate already
   returns the response untouched for Server Actions, so the lookup only cost a round trip. Each action
   still authenticates itself. Removes 1 request from every action, including every check-in/heartbeat.
   *Behavior change: none.* (Tests added for the whole gate first, then the change.)
2. **Attendance check-in 30 s -> 60 s** (`useAgentActivityMonitor.ts`). Thresholds are 5 min (break
   overdue grace), 30/45 min (inactivity), so they stay accurate to within a minute.
   *Behavior change: alerts can arrive up to 30 s later.* **Owner decision** - revert the single commit to
   keep 30 s.
3. **Script heartbeat 60 s -> 90 s** (`leadgen-script-status.ts`; both CRMs share the constant). The
   existing 3-minute "stale" rule still leaves a full interval of slack (a guard test enforces this).
   *Behavior change: an admin's "agent is on the script" indicator can lag up to 30 s.* **Owner decision.**
4. **Proxy: verify the token locally (`getClaims`) on protected agent / leadgen / subcontractor / client
   pages.** Skipped for login/public pages (avoids a revoked-session redirect loop) and for `/admin` (the
   forced password-change flag must be fresh). With asymmetric JWT signing keys this removes an Auth
   round trip per page request and prefetch; with the legacy shared secret the Supabase client falls back
   to `getUser()`, so nothing changes and nothing breaks. **Owner decision** and **needs one check from you**:
   Supabase dashboard -> Project Settings -> JWT Keys. Only the asymmetric ("ECC/RSA signing key") setting
   gives the saving; I could not read that setting from here. Pages/actions still call `getUser()` through the
   `require*()` gates, so a revoked session is rejected there; the only difference is the proxy may let a
   revoked-but-unexpired token reach the page, which then redirects to login.
5. **Draft SQL (not applied, in `supabase/pending-approval/`)**: drop the two duplicate indexes the
   advisor flagged (identical definitions; the copies kept have 14k scans vs 2-4 for the dropped ones).

## Estimated effect

Estimate, not a measurement: commits 1-3 together remove about 15-20% of requests (about 6-8k of the
42k/day sample: 1 request x about 2.3k actions, half of the check-in runs, a third of heartbeat runs).
Commit 4 adds more only if the project uses asymmetric signing keys. That would bring a 2.1M/month
project to roughly 1.7M/month; it will not by itself drop below any plan threshold.

## How to verify after (and before) any deploy

Run in the Supabase logs explorer for a comparable weekday window, before and after:

```sql
select arrayElement(splitByChar('?', log_attributes['request.path']), 1) as path,
       log_attributes['request.method'] as method, count() as n
from logs where source = 'edge_logs'
group by path, method order by n desc limit 25
```

Expect `/auth/v1/user`, `leadgen_clients`, `leadgen_campaigns`, `call_list_segments`,
`leadgen_users` and `leadgen_agent_attendance` to fall; nothing else should change materially.

## Reviewed and deliberately NOT changed

- **Heartbeat de-duplication** (the action fetches segment/campaign/client twice: about 3 requests). The
  duplicated reads sit inside shared authorization helpers used by many call-list actions; refactoring
  security checks for about 2% of traffic is not worth the risk now.
- **Fast-path heartbeats that skip the assignment re-check.** Would need a new column or accept a stale
  authorization window; propose only if you want to go further.
- **397 `auth_rls_initplan` policies / 866 multiple-permissive-policy warnings.** Tables are tiny (largest
  6,200 rows), so the per-row cost is negligible, and rewriting hundreds of access-control policies
  carries far more risk than benefit at this size. Revisit if data grows 10-100x.
- **263 unindexed foreign keys, 95 unused indexes.** Same reasoning; dropping "unused" indexes based on
  one stats window can remove an index that month-end jobs need. No indexes are proposed for creation.
- **Slow query to investigate (not fix blind):** `call_list_leads` paging by `segment_id = ANY(...)` averages
  about 1.26 s over 654 calls and `crm_call_logs` about 35 ms over 23k calls. The first looks like per-row
  row-level-security cost on a service/agent path. It needs an `EXPLAIN ANALYZE` on a restored copy (not
  production) before changing anything.
- **`SELECT name FROM pg_timezone_names`** (546 calls, about 650 ms each): not found in this repo; it is
  most likely the Supabase dashboard/Studio. No action.
- `auth_db_connections_absolute` advisor note: a dashboard setting (switch Auth to percentage-based
  connections); no code involved.

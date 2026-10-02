# Winsalot Corp shared payroll register — verification report

Prepared October 2, 2026. Branch: `codex/shared-payroll-register`, rebased onto production commit `a1d363d`. Release approved. The exact shared-access migration was applied to production and recorded as `20261002211313_shared_payroll_register_access`. All subsequent historical fingerprints match. Merge/deployment results are recorded in the release response.

## Resulting experience

Both Admin payroll entry points read the same Winsalot payroll register, employee identities, historical records, audit trail, and existing centralized email history. Both agent My Pay entry points read the same own-record history. Existing entry-point authentication and source-specific write permissions remain in force.

Admin sees one compact row per payroll record, with employee, pay period, actual payment date, regular paid hours, gross wage, internet allowance, incentive/bonus, other additions, deductions, final amount, payment method, status, and View Statement. Clicking a row opens its detailed statement. Edit, approve, mark Paid, cancel, reopen, audit, and print controls use the existing workflow. Periods sort newest first; current/previous/specific period, employee, year, Paid, pending, reopened, and search filters retrieve history.

The period summary counts agents, Paid records, and outstanding records and sums stored gross wages, internet allowances, bonuses, deductions, and final payroll. It excludes cancelled records and keeps currencies separate. It does not calculate wages or replace the final stored amount.

My Pay has a compact Current / Latest Pay section and earlier history rows with statement and Print / Download actions. It retains the existing exclusion of cancelled records from the agent display; cancelled history remains available to Admin. Detailed statements retain attendance/hour fields, wage, allowances, additions, holiday pay, deductions, payment details, and Notes for agent. Print output now also includes the escaped agent note and record ID. Internal reopen reasons and audit actor IDs are excluded from agent component data and masked in the shared record view.

## Shared access without rebuilding payroll

Production inspection found the existing financial records split between `crm_payroll` and `leadgen_payroll`, although the Paid email workflow was already centralized. There were 11 records and no duplicate employee/period pairs. The improvement reads those original rows in place through security-invoker views:

- `winsalot_payroll`: original records and source provenance, with existing source-profile currency.
- `winsalot_payroll_agents`: one displayed identity per authenticated employee ID.
- `winsalot_payroll_audit_log`: original audit entries, without copying or rewriting them.

No payroll table, employee record, financial calculation, attendance calculation, or reporting engine is duplicated. Shared server actions resolve the persisted record's source and delegate to its original actions. Additional shared read policies allow active payroll Admins to retrieve both histories and active agents to retrieve only their own records. Original write policies and actor foreign keys remain intact: an Admin must have the original source workflow's Admin permission to mutate its records. Read access alone never grants write access. The existing production Admin is provisioned in both workflows.

New record creation uses the shared employee identity's existing source membership, consistently from either CRM entry point. Existing record edits and attendance suggestions use the record's original workflow. Admin-approved stored inputs remain the statement source of truth.

The database guard serializes insert/period-key changes with an employee-scoped transaction advisory lock and checks both original tables. It rejects a duplicate exact pay period or payday, including a cancelled or reopened record; Admin must retrieve the existing record. A migration preflight stops on historical duplicates instead of merging or rewriting them. Original finalized-payment and append-only audit protections are unchanged.

History loaders fetch all result pages through the user's session/RLS so records and audits remain retrievable beyond PostgREST's default row limit. A page-read error is shown as an error rather than presenting partial history as complete.

## Verification

| Check | Result and evidence |
|---|---|
| Existing calculations | PASS. `src/lib/payroll.ts` and both original payroll action files have no diff. Existing attendance and holiday calculation functions and stored generated totals are unchanged. |
| Historical data | PASS. Production read-only fingerprints of all payroll and audit rows match the starting fingerprints exactly; see table below. Local migration test compares complete historical rows and audits before/after. |
| Agent isolation | PASS. Local PostgreSQL/RLS tests exercise an agent across both stores, another agent, Admin, client, inactive user, and anonymous role. Agent reads return only their own rows; payroll and audit writes are denied. |
| Internal-note privacy | PASS for the shared view, agent component projection, statement UI, print output, and existing email template. Internal reopen reason is masked and excluded from agent props; agent notes are included and HTML escaped in print. Audit entries remain Admin-only. |
| Historical retrieval | PASS. Browser filters exercise all periods, year, reopened, and agent search. Loader test retrieves 1,007 records across three response pages with stable ordering and agent scope. |
| Duplicate/reopened records | PASS. Database tests reject duplicates in either source, including changed payday; reopening retains one record and still blocks a second record. Preflight rejects historical duplicates. Advisory-lock serialization is included in the SQL guard; the local PGlite tests use one database session rather than a multi-connection race. |
| Finalized/audit protection | PASS. Local tests reject editing a Paid record and preserve append-only audit behavior and original source write permission. |
| Payroll email | PASS. Existing Paid transition, duplicate suppression, reopened record, failed/ambiguous send, delivery webhook, out-of-order event, early-event, and logging tests pass. Email sender, Resend integration, unique notification claims, and webhook code have no diff. No live payroll email was sent during verification. |
| Print / Download | PASS. Browser opens the existing standalone statement and renders a one-page A4 PDF with stored amounts, note, payment method/date, and record identity; no internal reason appears. Browser Print / Save as PDF remains the export mechanism. |
| Desktop/mobile | PASS at 1440px and 390px. Filters, register/history, native statement dialog, audit display, Escape/Close, and print popup work. Tables scroll within their own regions; page and dialog have no horizontal overflow. No console/page errors. Screenshots inspected. |
| Tests | PASS: `npm test -- --reporter=dot`: 119 files, 1,182 tests (rerun after migration and rebase). Includes 23 new shared-data, action, presentation, migration, and security tests. |
| TypeScript | PASS: `npx tsc --noEmit`. |
| Lint | PASS: `npm run lint`, zero errors; the same 16 pre-existing warnings remain outside this change. |
| Build | PASS: `npm run build`. Temporary synthetic preview route removed before final build. |
| Diff hygiene | PASS: `git diff --check`. |

Browser checks used synthetic data rendered by the actual payroll components. Database checks execute the relevant original payroll migrations and the new migration in PGlite's PostgreSQL engine with RLS roles. Production read-only role checks also pass for Henry, Goodness, Admin, unknown identity, and anonymous access. Signed-in browser checks of real user sessions were not performed; browser checks use synthetic data. No legal or tax compliance certification is claimed.

### Production historical fingerprints

Read-only `md5(string_agg(to_jsonb(row)::text, '' order by id))` results match the initial inspection:

| Object | Rows | Fingerprint |
|---|---:|---|
| `crm_payroll` | 2 | `6a2bb363007546ad74989a92fec0e8ca` |
| `leadgen_payroll` | 9 | `a8a06890244969fc71fb26279035c900` |
| `crm_payroll_audit_log` | 6 | `a590a2bb0893928f5c84ebef69005f5d` |
| `leadgen_payroll_audit_log` | 18 | `b74be8c954a918b81c476c3fe7abf667` |
| `payroll_email_notifications` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

## Migration and release boundary

One migration is required: `supabase/migrations/20261002204301_shared_payroll_register_access.sql`. It adds views, scoped read policies, authorization predicates, and duplicate-guard triggers. It performs no payroll/attendance/audit/notification backfill or data rewrite and changes no amount expression. Apply it before deploying the application that reads the views. If its historical-duplicate preflight fails, stop for review.

The exact migration is now applied in production, with history version `20261002211313` assigned by the existing Supabase migration tool. Its original source filename remains `20261002204301_shared_payroll_register_access.sql`. Shared views, both duplicate guards, RLS, grants, and production historical fingerprints were verified after application. Security advisors report the two intentional, authenticated-only predicates returning the caller’s own payroll role; they accept no identity argument, write no data, and revoke anonymous execution. Other existing advisor warnings are outside this release. Source-specific permissions remain unchanged. Merge and Vercel deployment results will be reported after required release checks complete.

## Exact files changed

Application and dependency files:

- `package.json`
- `package-lock.json`
- `src/app/admin/(dashboard)/crm/payroll/page.tsx`
- `src/app/leadgen/admin/(dashboard)/payroll/page.tsx`
- `src/app/agent/(dashboard)/pay/page.tsx`
- `src/app/leadgen/agent/(dashboard)/pay/page.tsx`
- `src/components/payroll/AdminPayrollClient.tsx`
- `src/components/payroll/MyPayView.tsx`
- `src/components/payroll/PayrollStatementDialog.tsx`
- `src/lib/pay-statement.ts`
- `src/lib/shared-payroll.ts`
- `src/lib/shared-payroll-actions.ts`
- `src/lib/shared-payroll-data.ts`
- `src/lib/__tests__/shared-payroll.test.ts`
- `src/lib/__tests__/shared-payroll-actions.test.ts`
- `src/lib/__tests__/shared-payroll-data.test.ts`
- `src/lib/__tests__/shared-payroll-migration.test.ts`
- `supabase/migrations/20261002204301_shared_payroll_register_access.sql`

Review evidence:

- `docs/payroll-ui-verification.md`
- `docs/payroll-ui-verification/browser-results.json`
- `docs/payroll-ui-verification/admin-desktop.png`
- `docs/payroll-ui-verification/admin-mobile.png`
- `docs/payroll-ui-verification/agent-desktop.png`
- `docs/payroll-ui-verification/agent-mobile.png`
- `docs/payroll-ui-verification/statement-desktop.png`
- `docs/payroll-ui-verification/statement-mobile.png`
- `docs/payroll-ui-verification/statement-print.pdf`

`@electric-sql/pglite` is a development-only dependency for executable database/migration/security tests. The temporary browser preview and browser dependencies are not included in the application change.

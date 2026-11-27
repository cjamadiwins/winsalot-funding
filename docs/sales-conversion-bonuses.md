# Sales Conversion Bonuses

CA$50 per appointment that Admin confirms resulted in a sale, credited to the agent who booked it
(`leadgen_appointments.booking_agent_id`, the same "credited agent" the performance report uses).

| Client | Funding | Client leg | Agent leg |
| --- | --- | --- | --- |
| Teknokraft Canada Inc. (`teknokraft-canada`) | Teknokraft pays Winsalot | **Client receivable** until Admin records receipt | Winsalot pays the agent via payroll |
| Hidebrandt Web Services (`hidebrandt-web-services`) | Winsalot funds it | none (`not_applicable`) | Recorded as a **Winsalot bonus expense** |

Client payment status and agent payment status are separate columns. The agent can be approved/paid
before or after the client pays, and nothing is ever marked paid automatically: **Mark paid** needs the
actual payment date, a payment reference and an explicit confirmation.

## Where things live
- Migration: `supabase/migrations/20261029000000_sales_conversion_bonuses.sql` (additive only; no existing
  table is altered). Tables `winsalot_sales_bonus_programs`, `winsalot_sales_conversion_bonuses`,
  `winsalot_sales_conversion_bonus_audit`.
- All rules are enforced in the database via checked functions, so a stale page or forged request cannot bypass them:
  `winsalot_confirm_sales_conversion` (Lead Gen Admin only), `winsalot_approve_sales_bonus`,
  `winsalot_mark_sales_bonus_paid`, `winsalot_void_sales_bonus`, `winsalot_record_sales_bonus_client_payment`
  (Admin of either CRM), `winsalot_my_sales_bonuses` (agent's own rows, no client billing fields).
- **Duplicates:** one live bonus per appointment *and* per lead (a re-booked appointment for the same prospect is the
  same sale), enforced by partial unique indexes. Voiding a mistaken bonus frees the sale.
- **Lead Gen CRM:** `/leadgen/admin/sales-bonuses` (new section), a "Sales Bonus" control on each appointment card,
  and the payroll page. Agents see their bonuses under My Pay in both CRMs.
- **Growth CRM:** the payroll dashboard (`/admin/crm/payroll#sales-bonuses`) shows pending / approved / paid bonuses,
  the Teknokraft receivable, and the Hidebrandt bonus expense; approved + paid bonuses feed the Payroll Cost Summary.

## Payroll integration decision
Bonuses are paid in CAD, but agents' salary records are in their own payroll currency (often NGN) and paid records are
locked. So bonuses are recorded as their own centrally-tracked payroll lines (scheduled to a payroll payday on
approval) rather than being added into `crm_payroll`/`leadgen_payroll.bonus_commission`. Existing salary
arrangements and every existing payroll record are untouched (verified in the migration test).

## Rollout
1. Review this PR; Admin approves. 2. Apply the migration to Supabase (it seeds only the two programs above).
3. Deploy. Until the migration is applied the new sections show an "unavailable" notice and the existing payroll
register is unaffected.

# Appointment Quality Control (Lead Generation CRM)

Delivers only appointments with prospects who want a service the client actually offers. It applies per client; Hidebrandt Web Services and Teknokraft Canada Inc. are seeded as gated, every other client behaves exactly as before.

Migration: `supabase/migrations/20261103120000_leadgen_appointment_qualification.sql`. It is additive (new tables, new defaulted columns on `leadgen_appointments`, three re-created client-facing policies). It does not update or delete any existing row.

## How it works

1. **Per-client services** (`leadgen_client_qualification_settings`). Admin chooses what each client offers. Seeded: Hidebrandt = new website, redesign/rebranding, e-commerce, SEO/online visibility, human search optimization. Teknokraft = new website, redesign/rebranding, SEO/online visibility. Teknokraft e-commerce is **off** until Admin confirms it; services are never assumed to be shared. Admin can add confirmed custom services.
2. **Agent qualification** (`leadgen_lead_qualifications`, one per lead). The lead page shows a card with the eight mandatory questions, the services the client offers, and the filtering category. Categories set automatically are *preliminary* (`category_source = auto_preliminary`) until the agent saves a non-draft outcome (`agent_verified`).
3. **Booking.** For a gated client, an agent (or Admin) can only submit an appointment for a lead whose saved qualification is `qualified`. The database then forces the appointment to `pending_review`.
4. **Admin review** (`/leadgen/admin/appointment-quality`). Admin sees the answers and can approve, reject (reason required) or send back for more qualification (feedback required). Approval releases the notifications that were held.
5. **Agents** (`/leadgen/agent/appointment-approvals` and the lead page card) see status, rejection reason and Admin feedback, and can update the qualification and resubmit.

## What "Qualified" requires (enforced by database triggers)

All eight answers recorded; the prospect understands the services; the prospect agreed to the appointment; the prospect does not want lead generation only; and at least one selected service is approved for that client. An appointment can only become `approved` by an Admin user, with a linked qualification that still satisfies the above for the same lead and client. Agents cannot change review state at all, including by calling the API directly.

## Held until approval

While an appointment is `pending_review`, `needs_info` or `rejected` nothing goes to the client or the prospect:

- new-appointment email/SMS to the client, the prospect confirmation email and immediate confirmation SMS (only an internal "awaiting approval" email goes to the Winsalot admin inbox);
- manual resend/reminder emails and SMS, automatic 24-hour/1-hour prospect reminders and business reminders;
- appointment brief preview and send;
- the client portal itself: client policies on `leadgen_appointments` and `leadgen_conversions` hide the appointment (and the conversion row the existing trigger creates) until it is approved;
- the lead's visible status and the client activity feed: the booking is recorded as an internal note and the usual `Appointment booked` entry and status are written on approval.

## Appointment brief

An approved appointment's brief includes a Qualification section: prospect and business, website URL or no-website status, requested services, confirmed challenges, intended improvements, qualification notes, date/time and assigned agent. Anything the prospect did not state is shown as "Not stated by the prospect" / "Not confirmed", and a qualification that is not verified is labelled as unconfirmed.

## Existing appointments

Appointments that existed before the migration keep `qc_status = not_required`; their status, outcome, reminders and history are untouched. Those under gated clients whose website-service interest is unclear (no mention of website/SEO/e-commerce interest, or lead generation / cold calling mentioned) are listed in `leadgen_appointment_legacy_flags` and shown under "Older appointments flagged for review". Flags are review-only.

## Reporting

Per client and per agent: leads contacted, qualified, submitted, approved, rejected, acceptance rate, rejection reasons, completed (approved and marked Completed) and converted (approved with a `converted_paid` / `converted_payment_pending` conversion). Appointments from before the process are not counted as "submitted".

## Rollout and rollback

- Code is safe to deploy before or after the migration: every new read tolerates the missing tables/columns and treats an absent `qc_status` as "no review required".
- Apply the migration, then check `/leadgen/admin/appointment-quality` and the seeded service lists.
- To switch a client off without a migration: turn off "Require qualification + Admin approval" on that page. Already-pending appointments stay pending until decided.
- The incentive review (`incentive_status`), payroll and commission tables are not touched; approval is a separate step from incentive review.

## Not covered by automated tests

- The automatic reminder jobs (cron) skipping unapproved appointments: the guard is a one-line check in each job loop (`isClientNotifiable`), covered only indirectly.
- Rendered screens (agent card, Admin page) were type-checked and linted but not exercised in a browser.

# Private Quote Management System

A private admin dashboard for managing quote requests submitted through the public
landing page (`/commercial-cleaning-quote`), assigning them to one of your cleaning providers via a
secure link, and approving the final price before it goes to the customer.

The public page never mentions a specific cleaning company and never contacts a provider
automatically — this system is how you (the admin) route requests manually.

## How it works

1. A customer submits the public quote form → saved in Supabase, you're notified by SMS +
   email (unchanged from before).
2. You open the request in the admin dashboard at **`/admin`** and assign it to one of your
   cleaning providers (or add a new one on the spot).
3. You generate a one-time secure link — `/provider-quote/[token]` — and send it to that
   provider yourself (text, email, however you normally reach them). The system never sends
   it for you.
4. The provider opens the link and sees **only** that one job's cleaning details (property
   type, size, location, description, etc.) — not the customer's name, phone, or email, not
   your other requests, and not your other providers. They enter their price and submit.
5. You get notified by SMS + email that a provider quote came in — the message includes the
   provider's name, the customer's name, the city, the submitted price, and a link straight to
   the request in `/admin`. The request is marked **Awaiting Winsalot Approval**.
6. You review the provider's private submission (never shown to the customer), edit the
   price, pricing unit, provider name, service description, and any notes/terms the
   *customer* will see, and click **Approve**. This only saves your review — **nothing is
   sent to the customer yet.**
7. When you're ready, click **Send Quote to Customer**. Only this button ever emails the
   customer. It generates a secure, single-use link, sends a branded Winsalot Corp email with
   **Accept Quote** / **Decline Quote** buttons pointing at that link, and marks the request
   **Sent to Customer**.
8. The customer opens the link (no login required) and sees only the quote you approved —
   never the provider's private submission or contact details — and accepts or declines,
   optionally leaving a comment. You're notified immediately (SMS + email on acceptance,
   email on decline) and the dashboard reflects **Customer Accepted** or **Customer
   Declined**.

### Full status pipeline

`Request Submitted` → `Sent to Provider` → `Awaiting Winsalot Approval` → `Approved` →
`Sent to Customer` → `Customer Accepted` / `Customer Declined`.

## 1. Run the new migrations

In the Supabase SQL Editor, run, in order:

- [`supabase/migrations/0004_provider_quote_system.sql`](../supabase/migrations/0004_provider_quote_system.sql) —
  adds `cleaning_providers` (the companies you can assign requests to),
  `provider_quote_tokens` (hashed, expiring, revocable provider links — 30-day expiry by
  default), `provider_quote_submissions` (the price a provider submits), and a few columns on
  `quote_requests` for assignment + the approved customer quote.
- [`supabase/migrations/0006_customer_quote_approval.sql`](../supabase/migrations/0006_customer_quote_approval.sql) —
  adds `customer_quote_tokens` (the customer's secure accept/decline link, same hashed-token
  model, default 7-day expiry) and a few more columns on `quote_requests` for the
  provider-name/notes shown to the customer and their accept/decline response.

Like every other table in this project, RLS is enabled with no public policies — only the
service role key (used server-side by the admin dashboard and the token-validated
provider/customer pages) can read or write any of this.

## 2. Add the new environment variables

The admin dashboard uses [Supabase Auth](https://supabase.com/docs/guides/auth) for your
login. Add this variable to `.env.local` (and to Vercel):

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Get it from Supabase → **Project Settings → API → Project API keys → anon / public**. This
key is safe to expose to the browser (that's what "public" means) — it's only used to sign
you in and out; it can't read or write any data on its own because RLS blocks it, same as
before.

Also set `NEXT_PUBLIC_SITE_URL` (e.g. `https://leads.winsalotcorp.com`) so the "view in admin
dashboard" link included in provider-quote notification emails/SMS points at your real
domain — see `.env.example`.

## 3. Create your admin login

Supabase Auth users aren't created via SQL. In the Supabase dashboard:

1. Go to **Authentication → Users → Add User**.
2. Enter your email and a password, and confirm the user (or use "Auto Confirm User" if
   offered) so you don't need to click an email confirmation link.

That's your login for `/admin/login`. There's no public sign-up page — only the account(s)
you create this way can sign in.

## 4. Using the dashboard

- **`/admin`** — list of all quote requests with their status (see the pipeline above).
- **`/admin/requests/[id]`** — full request detail. Assign a provider, generate/revoke
  their link, review their private submitted price, edit and **Approve** the customer-facing
  quote, then **Send Quote to Customer** when ready. Once sent, this page shows whether the
  customer accepted, declined, or hasn't responded yet, plus any comments they left.
- **`/admin/providers`** — add and edit cleaning providers (company name, contact person,
  email, phone, service locations, pricing notes, internal notes, active/inactive). Setting
  a provider to **inactive** removes them from the assignment dropdown for new requests
  without deleting their history.

Adding a new provider never requires a code change or a redeploy — it's just a row in the
`cleaning_providers` table, created from the dashboard.

## 5. Security notes

- **Tokens are hashed at rest.** The raw link is shown to you exactly once, right after you
  generate it — copy it then. Only its SHA-256 hash is stored, so a database read alone
  can't be used to impersonate a provider.
- **Every link is scoped to exactly one request and one provider.** The provider-facing
  page and its submit action both re-derive the request/provider from the token
  server-side — they never trust an ID passed from the browser.
- **Links expire (30 days) and can be revoked** from the request detail page at any time.
- **Providers never see:** other customers' requests, other providers, your admin
  dashboard, or the customer's name/phone/email. They see only what's needed to price the
  job: property type, cleaning type, bedrooms/bathrooms, size, location, preferred date,
  frequency, and the description.
- **Customers never see:** the provider's private submission, the provider's real contact
  info, internal/pricing notes, or any other customer's data. The `/customer-quote/[token]`
  page only ever renders the fields Winsalot Corp explicitly approved (price, pricing unit,
  provider name, service description, notes/terms) — nothing is pulled directly from
  `provider_quote_submissions` or `cleaning_providers.internal_notes`/`pricing_notes`.
- **Nothing reaches the customer automatically.** A provider's submission only updates the
  private admin dashboard. Approving a quote only saves your edits. The customer is emailed
  only when you explicitly click **Send Quote to Customer**.
- **The admin dashboard itself requires a real login** (Supabase Auth), enforced both by
  `src/proxy.ts` (redirects anonymous visitors to `/admin/login`) and independently inside
  every admin Server Action (so a proxy-matcher change later can't accidentally leave a
  mutation unprotected).
- Nothing here changes how the public form, its API route, the Supabase service-role key,
  or the Twilio/Resend notifications work — see
  [`docs/commercial-cleaning-quote.md`](./commercial-cleaning-quote.md) for that setup.

## 6. Testing checklist

- [ ] Visiting `/admin` while signed out redirects to `/admin/login`
- [ ] Signing in with your Supabase Auth user reaches the dashboard
- [ ] A new provider can be added from `/admin/providers`
- [ ] Assigning a provider to a request updates its status to "Assigned"
- [ ] Generating a provider link shows the raw link exactly once; refreshing the page never
      shows it again
- [ ] Opening the generated link in an incognito/private window shows only that job's
      cleaning details — no customer name/phone/email, no other requests
- [ ] Submitting a price on that page notifies you by SMS + email — including the provider
      name, customer name, city, price, and a working link to the request in `/admin` — and
      updates the request to "Provider Quote Received"
- [ ] Opening the same link again after submitting shows "already submitted", not the form
- [ ] Revoking a link makes it show "no longer valid" immediately
- [ ] An expired link (or one for a deleted/mismatched token) also shows "no longer valid"
- [ ] Clicking **Approve** saves your edits and marks the request "Approved" — confirm no
      email was sent to the customer at this point
- [ ] Clicking **Send Quote to Customer** (only enabled once approved) sends the customer a
      branded email with working Accept/Decline buttons, and marks the request "Sent to
      Customer"
- [ ] Opening the customer's link in an incognito window shows only the approved quote — no
      provider contact info, no other customer's data
- [ ] Accepting on that page updates the request to "Customer Accepted", records the
      timestamp, and notifies you by both SMS and email
- [ ] Declining with a comment updates the request to "Customer Declined", saves the
      comment, and notifies you by email (no SMS)
- [ ] Revisiting an already-answered or expired customer link shows a read-only message
      instead of the form

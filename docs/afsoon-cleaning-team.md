# Afsoon Cleaning Team — Landing Page

A quote-request landing page for Afsoon Cleaning Team, served at **`/afsoon-cleaning`** in
this Next.js project. It lives alongside the existing site in this repo and doesn't change
anything at `/`.

- Page: `src/app/afsoon-cleaning/page.tsx` + `src/components/afsoon-cleaning/*`
- API route: `src/app/api/afsoon-cleaning-quote/route.ts`
- Business info (name, phone, pricing, hours, service area): `src/config/business.ts`
- Database migration: `supabase/migrations/0003_create_quote_requests.sql`

## 1. Install and run locally

You need [Node.js](https://nodejs.org/) 20 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:3000/afsoon-cleaning](http://localhost:3000/afsoon-cleaning).

The form will not fully work yet — you need to connect Supabase, and optionally Twilio and
Resend, first. See below.

## 2. Where to edit business info

Open **`src/config/business.ts`**. Everything a non-developer would want to change lives
there:

- Business name
- Phone number (`display` is what customers see, `href` is what the "Call Now" button dials)
- Email address
- Operating hours
- Service areas
- Pricing (Toronto rate, GTA rate range, travel time note, disclaimer)

Service cards, "Why choose us" bullets, and page copy live in the individual components
under `src/components/afsoon-cleaning/`. The SMS/email **notification destinations** (where
alerts are sent, as opposed to the business's own public phone/email) are set via
environment variables instead, so they can be changed per-environment without touching code
— see the next section.

## 3. Connect Supabase (required — this is where quote requests are saved)

1. Create a free project at [supabase.com](https://supabase.com) (or reuse an existing
   project — this table doesn't conflict with the `leads` / `lead_generation` tables already
   used by the rest of this app).
2. In the Supabase dashboard, open the **SQL Editor** and run the contents of
   [`supabase/migrations/0003_create_quote_requests.sql`](../supabase/migrations/0003_create_quote_requests.sql).
   This creates the `quote_requests` table.
3. In **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`
4. Copy `.env.example` to `.env.local` and paste both values in.

The service role key bypasses Row Level Security and must never be exposed to the browser —
it's only read in `src/lib/supabase-admin.ts`, which is server-only code (API routes), never
imported by a client component.

To check submissions: Supabase dashboard → **Table Editor → quote_requests**.

## 4. Connect Twilio (optional — SMS alert on each new quote request)

1. Create an account at [twilio.com](https://www.twilio.com) and buy/activate a phone
   number capable of sending SMS.
2. From the [Twilio Console](https://console.twilio.com), copy your **Account SID** and
   **Auth Token**.
3. Add to `.env.local`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1XXXXXXXXXX   # the Twilio number you bought
   SMS_NOTIFICATION_NUMBER=6473001270 # the number that receives the alert
   ```

If these variables are missing or invalid, quote requests are still saved to Supabase — the
SMS step just fails quietly and is logged server-side (see Section 7).

## 5. Connect Resend (optional — backup email alert on each new quote request)

1. Create a free account at [resend.com](https://resend.com).
2. Verify a sending domain under **Domains** (required to send from your own address; while
   testing you can use Resend's shared `onboarding@resend.dev` sender, but that only
   delivers to the email address on your Resend account).
3. Create an API key under **API Keys**.
4. Add to `.env.local`:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   NOTIFICATION_EMAIL=info@winsalotcorp.com
   EMAIL_FROM=Afsoon Cleaning Team <quotes@yourdomain.com>
   ```

Like SMS, a missing/invalid Resend config never blocks the Supabase save — it only skips the
email and logs the failure server-side.

## 6. Test the form locally

With `npm run dev` running and at least Supabase configured:

1. Go to `http://localhost:3000/afsoon-cleaning#quote`.
2. Fill in the required fields (Full name, Phone, City, Property type, Cleaning type,
   Description, Consent checkbox) and submit.
3. You should see: *"Thank you for contacting Afsoon Cleaning Team..."* and the form should
   disappear (refreshing the page brings it back, by design).
4. Check the `quote_requests` table in Supabase for the new row.
5. If Twilio is configured, check the destination phone for a text starting with
   *"New Afsoon Cleaning Team quote request"*.
6. If Resend is configured, check the notification inbox for a *"New Quote Request - Afsoon
   Cleaning Team"* email.

To test validation, try submitting with required fields empty (client-side validation should
block it) and check the terminal running `npm run dev` for `[afsoon-cleaning-quote]` log
lines if something fails server-side.

## 7. Deploying to Vercel

1. Push this repo to GitHub (or your Git provider of choice) if it isn't already.
2. In [Vercel](https://vercel.com), **Add New → Project** and import the repo. Next.js is
   auto-detected — no build settings need to change.
3. Before the first deploy (or right after, then redeploy), add environment variables:
   **Project → Settings → Environment Variables**, and add each of the following for
   **Production** (and **Preview** if you want quote requests from preview deployments to
   work too):

   | Variable | Required | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Yes | From Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same page. Server-only — do not prefix with `NEXT_PUBLIC_` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes, for `/admin` | Same page (anon/public key). Powers admin dashboard sign-in — see [`docs/provider-quote-system.md`](./provider-quote-system.md) |
   | `TWILIO_ACCOUNT_SID` | Optional | Enables SMS alerts |
   | `TWILIO_AUTH_TOKEN` | Optional | |
   | `TWILIO_PHONE_NUMBER` | Optional | |
   | `SMS_NOTIFICATION_NUMBER` | Optional | Defaults suggestion: `6473001270` |
   | `RESEND_API_KEY` | Optional | Enables backup email alerts |
   | `NOTIFICATION_EMAIL` | Optional | Defaults suggestion: `info@winsalotcorp.com` |
   | `EMAIL_FROM` | Optional | Must be on a domain verified in Resend |

4. Deploy. Your live page will be at `https://<your-project>.vercel.app/afsoon-cleaning`.
5. Point a custom domain at it under **Project → Settings → Domains**, if desired.

## 8. Testing checklist (production / staging)

- [ ] Submitting the form with all required fields filled shows the thank-you message
- [ ] Submitting with a required field missing is blocked client-side with a clear message
- [ ] The new row appears in Supabase → `quote_requests`, with `status = new` and
      `source = Afsoon Cleaning Team landing page`
- [ ] The SMS notification arrives at the configured `SMS_NOTIFICATION_NUMBER` and starts
      with "New Afsoon Cleaning Team quote request"
- [ ] The backup email notification arrives at `NOTIFICATION_EMAIL` with subject
      "New Quote Request - Afsoon Cleaning Team" and includes all submitted fields
- [ ] Temporarily breaking the Twilio or Resend env vars (e.g. wrong auth token) still lets
      the form submit successfully and still saves to Supabase — check the Vercel function
      logs for the corresponding `[afsoon-cleaning-quote]` error line
- [ ] Submitting the form more than 5 times quickly from the same device returns a
      "Too many requests" message instead of saving further rows
- [ ] The page renders correctly on a phone-sized screen, a tablet, and a desktop browser
- [ ] The "Call Now" button dials the correct number on a phone
- [ ] Nav links (Home, Services, Pricing, Request a Quote) scroll to the right section

## 9. Notes on the spam protections

- **Honeypot**: the form includes a hidden `website` field that's invisible and unreachable
  by keyboard for real visitors. If it's filled in, the API route silently returns success
  without saving anything or sending notifications — this avoids tipping off bots that they
  were caught.
- **Rate limiting**: `src/lib/rate-limit.ts` allows at most 5 submissions per 15 minutes per
  IP address, tracked in memory. This resets on deploys/restarts and doesn't share state
  across multiple serverless instances — it's a basic spam deterrent, not a hard security
  boundary. If you outgrow it, consider a shared store (e.g. Upstash Redis) or a service
  like Cloudflare Turnstile in front of the form.

## 10. Security notes

- `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_AUTH_TOKEN`, and `RESEND_API_KEY` are only read in
  server-only modules (`src/lib/supabase-admin.ts`, `src/lib/twilio.ts`, `src/lib/resend.ts`)
  and inside the API route handler — never in a `"use client"` component, so they're never
  sent to the browser.
- All form input is validated and length-limited on both the client (immediate feedback) and
  the server (the only check that actually matters for security, since client-side checks
  can be bypassed).
- Error responses sent to the browser are generic ("Something went wrong. Please try again
  later.") — the real error, including anything from Supabase/Twilio/Resend, is only ever
  written to server-side logs, and those log lines never include the secret values above.

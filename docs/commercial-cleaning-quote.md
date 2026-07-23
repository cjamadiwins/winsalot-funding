# Commercial &amp; Home Cleaning Quote — Landing Page

A quote-request landing page, served at **`/commercial-cleaning-quote`** in this Next.js
project. It's intentionally brand-neutral (no company name, no city, no fixed pricing) so
it can be reused for different cleaning clients and ad campaigns — see
[`docs/provider-quote-system.md`](./provider-quote-system.md) for how requests get routed
to a specific cleaning provider behind the scenes. It lives alongside the existing site in
this repo and doesn't change anything at `/`.

- Page: `src/app/commercial-cleaning-quote/page.tsx` + `src/components/commercial-cleaning/*`
- API route: `src/app/api/commercial-cleaning-quote/route.ts`
- Business info (name, phone, hours, service area): `src/config/business.ts`
- Database migration: `supabase/migrations/0003_create_quote_requests.sql`

## 1. Install and run locally

You need [Node.js](https://nodejs.org/) 20 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:3000/commercial-cleaning-quote](http://localhost:3000/commercial-cleaning-quote).

The form will not fully work yet — you need to connect Supabase, and optionally Twilio and
Resend, first. See below.

## 2. Where to edit business info

Open **`src/config/business.ts`**. Everything a non-developer would want to change lives
there:

- Business name (kept generic on purpose — see the note at the top of the file)
- Phone number (`display` is what customers see, `href` is what the "Call the Quote Team"
  button dials)
- Email address
- Operating hours
- Service area summary

There are no fixed rates anywhere on the page — pricing is explained as customized per
request, and the actual number is set later in the admin dashboard once a provider quotes
the job (see `docs/provider-quote-system.md`).

Service cards, "Why choose us" bullets, and page copy live in the individual components
under `src/components/commercial-cleaning/`. The SMS/email **notification destinations**
(where alerts are sent, as opposed to the business's own public phone/email) are set via
environment variables instead, so they can be changed per-environment without touching code
— see the next section.

## 3. Connect Supabase (required — this is where quote requests are saved)

1. Create a free project at [supabase.com](https://supabase.com) (or reuse an existing
   project — this table doesn't conflict with the `leads` / `lead_generation` tables already
   used by the rest of this app).
2. In the Supabase dashboard, open the **SQL Editor** and run the migrations in order:
   [`0003_create_quote_requests.sql`](../supabase/migrations/0003_create_quote_requests.sql)
   (creates the table),
   [`0004_provider_quote_system.sql`](../supabase/migrations/0004_provider_quote_system.sql)
   (admin/provider workflow), and
   [`0005_neutral_quote_source_default.sql`](../supabase/migrations/0005_neutral_quote_source_default.sql)
   (only needed if your database already ran 0003 before it was updated — cleans up a
   leftover branded value in the `source` column; a brand-new install gets the correct
   value straight from 0003 and can skip it).
3. In **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`
4. Copy `.env.example` to `.env.local` and paste the values in.

The service role key bypasses Row Level Security and must never be exposed to the browser —
it's only read in `src/lib/supabase-admin.ts`, which is server-only code (API routes, Server
Actions), never imported by a client component.

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
SMS step just fails quietly and is logged server-side (see Section 8).

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
   EMAIL_FROM=Quote Notifications <quotes@yourdomain.com>
   ```

Like SMS, a missing/invalid Resend config never blocks the Supabase save — it only skips the
email and logs the failure server-side.

## 6. Test the form locally

With `npm run dev` running and at least Supabase configured:

1. Go to `http://localhost:3000/commercial-cleaning-quote#quote`.
2. Fill in the required fields (Full name, Phone, City, Property type, Cleaning type,
   Description, Consent checkbox) and submit.
3. You should see: *"Thank you for your request. Your quote request has been received..."*
   and the form should disappear (refreshing the page brings it back, by design).
4. Check the `quote_requests` table in Supabase for the new row.
5. If Twilio is configured, check the destination phone for a text starting with
   *"New Cleaning Quote Request"*.
6. If Resend is configured, check the notification inbox for an email with subject
   *"New Cleaning Quote Request"*.

To test validation, try submitting with required fields empty (client-side validation should
block it) and check the terminal running `npm run dev` for `[commercial-cleaning-quote]` log
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

4. Deploy. Your live page will be at `https://<your-project>.vercel.app/commercial-cleaning-quote`.
5. Point a custom domain at it under **Project → Settings → Domains**, if desired.

## 8. Testing checklist (production / staging)

- [ ] Submitting the form with all required fields filled shows the thank-you message
- [ ] Submitting with a required field missing is blocked client-side with a clear message
- [ ] The new row appears in Supabase → `quote_requests`, with `status = new` and
      `source = Cleaning Quote Request` (an internal tracking label, not shown to customers)
- [ ] The SMS notification arrives at the configured `SMS_NOTIFICATION_NUMBER`
- [ ] The backup email notification arrives at `NOTIFICATION_EMAIL` and includes all
      submitted fields
- [ ] Temporarily breaking the Twilio or Resend env vars (e.g. wrong auth token) still lets
      the form submit successfully and still saves to Supabase — check the Vercel function
      logs for the corresponding `[commercial-cleaning-quote]` error line
- [ ] Submitting the form more than 5 times quickly from the same device returns a
      "Too many requests" message instead of saving further rows
- [ ] The page renders correctly on a phone-sized screen, a tablet, and a desktop browser
- [ ] The "Call the Quote Team" button dials the correct number on a phone
- [ ] Nav links (Home, Services, Request a Quote) scroll to the right section

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

## 11. Google Ads "Request quote" conversion tracking

- **Base tag**: `src/components/GoogleAdsTag.tsx` renders Google's `gtag.js` (`AW-18338307179`)
  on `cleaning.winsalotcorp.com` / `www.cleaning.winsalotcorp.com` (checked against the
  request's `Host` header via `CLEANING_QUOTE_HOSTS` in `src/lib/hosts.ts`) — it's mounted in
  `src/app/commercial-cleaning-quote/layout.tsx`, which also covers `/` on that host since
  `src/proxy.ts` rewrites `/` to `/commercial-cleaning-quote` there. It also renders on this
  project's own Vercel **Preview** deployments (`process.env.VERCEL_ENV === "preview"`, a
  server-only value Vercel sets itself — not spoofable by a visitor's request), regardless of
  hostname, so a reviewer can validate the tag directly on a PR's preview URL with no local
  setup. It deliberately does not load on any other host or environment (admin/agent CRM,
  funding page, local dev, production domains other than the two above) so real ad-spend
  attribution is never at risk — and real ad campaigns never link to preview URLs in the first
  place, so this doesn't expose the tag to real traffic either.
- **Conversion event**: `gtag_report_conversion()` (`src/lib/google-ads.ts`) matches the exact
  event snippet Google Ads generates for this conversion action — `send_to:
  'AW-18338307179/g7jVCJfE69McEOu4sahE'`, `value: 1.0`, `currency: 'CAD'`. It's called from
  exactly one place, `QuoteForm.tsx`'s submit handler, only after `POST
  /api/commercial-cleaning-quote` responds `201` (i.e. only once the request has been validated
  *and saved* — never on page visit, never on click, never on a validation or API/DB failure).
- **One form, both property types**: residential ("home cleaning") and commercial quote
  requests go through the exact same `QuoteForm` component and the same `/api/commercial-
  cleaning-quote` endpoint — `propertyType` is just a field on the same payload — so the
  conversion event fires identically for both; there's no separate "home cleaning" form or flow
  to keep in sync.
- **Duplicate-conversion prevention**:
  - A `useRef` lock (`submittingRef`) plus a disabled submit button close the race where two
    clicks (or a fast double-click) dispatched in the same tick could both pass the `status`
    check before either `setStatus("submitting")` call commits — the second attempt is dropped
    before it ever calls the API or fires the event.
  - There is no separate "confirmation page" or URL — success is shown by swapping in a
    thank-you message from local React component state, with no `history.pushState` and no
    route change. Reloading the page returns to a blank form; there is nothing to replay, so a
    refresh can never re-fire the event.

**Verified end-to-end** against a production build (`next build && next start`), driving a real
Chromium browser (Playwright) and instrumenting `window.dataLayer` to record every `gtag()`
call, with the API mocked so no real Supabase writes or real Google Ads conversions were
involved in the automated checks. Checked against both the real `cleaning.winsalotcorp.com`
host (confirming production behavior is unchanged) and a plain host with `VERCEL_ENV=preview`
set (confirming the preview-testing path works with no hosts-file override):

- Visiting the page fires only the base `gtag('config', 'AW-18338307179')` call — never a
  `conversion` event.
- A successful (mocked `201`) submission fires **exactly one** conversion event, with a payload
  matching the snippet above exactly.
- Rapid double-clicking the submit button still produces exactly one API call and exactly one
  conversion event.
- Reloading the page after a successful submission fires **zero** additional conversion events.
- A failed (mocked `500`) submission fires **zero** conversion events.
- Both the "Residential" and "Commercial" property-type paths were exercised and behave
  identically, confirming the single shared code path claim above.

### Testing this with Google Tag Assistant

Since the base tag also renders on this project's Preview deployments, you can test directly on
a PR's preview URL in Chrome — no local build, no hosts-file edit:

1. Open the PR's preview URL directly, at the `/commercial-cleaning-quote` path specifically
   (the bare `/` root only gets the production→`/commercial-cleaning-quote` rewrite on the real
   `cleaning.winsalotcorp.com` domain, not on a preview URL).
2. Install the [Tag Assistant](https://tagassistant.google.com/) Chrome extension, click
   **Connect**/**Enable** on that tab, then reload the page.
3. Confirm Tag Assistant shows the `AW-18338307179` base tag loaded, and that **no** conversion
   event has fired yet from just loading the page.
4. Scroll to **Request a Quote**, fill in the form (try either "Residential" or "Commercial"),
   and submit.
5. Once the "Thank you for your request" message appears, confirm Tag Assistant shows exactly
   **one** Conversion event for `AW-18338307179/g7jVCJfE69McEOu4sahE` with value `1.0 CAD`.
6. Refresh the page and confirm no additional conversion event fires — the form is back to
   blank, not showing a replayable "confirmation" state.
7. Click submit twice in quick succession on a fresh submission and confirm only one conversion
   event is recorded.

One real test submission through this flow **will** register as a small ($1.00 CAD) conversion
in the live Google Ads account — that's expected of any true end-to-end tag validation and can
be safely ignored, or excluded from reporting in the Google Ads UI if desired.

### Troubleshooting: form submits successfully but no conversion appears

If Tag Assistant shows the base tag loaded, the form shows "Thank you for your request," but no
Conversion event shows up (in Tag Assistant or in `dataLayer` itself), the most common cause is
a **browser extension silently intercepting `gtag`** — many ad blockers and privacy tools (e.g.
uBlock Origin's default filter lists) don't just block the `googletagmanager.com/gtag/js`
request outright; they redirect it to a local no-op "surrogate" script that defines a harmless,
do-nothing `window.gtag`. That satisfies code that merely checks `typeof window.gtag ===
"function"`, and can still make some tag-detection tools report the base tag as "present," while
every event call silently goes nowhere.

`gtag_report_conversion()` (`src/lib/google-ads.ts`) now specifically detects this: it records
`dataLayer`'s length immediately before and after calling `window.gtag(...)`, and logs a
`console.warn` prefixed `[google-ads]` if the array didn't grow (or doesn't exist at all — some
surrogate scripts also prevent the page's own `dataLayer` initialization from ever running). It
also retries for up to 2 seconds if `window.gtag` isn't defined yet at all, in case the base
tag's own script is just slow, logging a different warning if it never shows up.

To confirm this is (or isn't) what's happening:

1. Open DevTools → Console **before** submitting the form.
2. Submit the form as usual.
3. Look for a `[google-ads]` warning in the console.
   - If you see one, an extension is very likely intercepting the tag — retest in an
     **Incognito window with extensions disabled** (Chrome menu → New Incognito Window; by
     default extensions don't run there unless explicitly allowed for Incognito).
   - If you see no warning and still no conversion, that's a genuine bug — report the full
     `JSON.stringify(dataLayer, null, 2)` output from the console at that point.

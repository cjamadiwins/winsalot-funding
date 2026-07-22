This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Commercial & home cleaning quote landing page

This repo also includes a standalone, brand-neutral quote-request landing page at
`/commercial-cleaning-quote`. See
[`docs/commercial-cleaning-quote.md`](docs/commercial-cleaning-quote.md) for setup,
environment variables, deployment and testing instructions specific to that page.

A private admin dashboard at `/admin` lets you assign incoming requests to a cleaning
provider via a secure link and approve the final quote before it's sent to the customer.
See [`docs/provider-quote-system.md`](docs/provider-quote-system.md) for setup and how it
works.

## Calling agent CRM

A CRM for calling agents at `/agent/login` to enter interested leads, follow up after a quote
is sent, and track the pipeline through to a closed opportunity — connected to, not
duplicating, the quote system above. See [`docs/crm.md`](docs/crm.md) for the full workflow,
schema, and roles.

## Cleaning Opportunities (CRM)

A "Cleaning Opportunities" section of the CRM above (`/admin/crm/opportunities` for admins,
`/agent/opportunities` for agents — same logins, roles, activity timeline, and follow-up
system as the rest of the CRM) that scans public, no-login sources (tenders, RFPs, and
similar signals) for organizations in Metro Vancouver/the Lower Mainland and the Greater
Toronto Area showing recent intent to buy commercial cleaning or janitorial services, scores
each one's intent, and alerts `info@winsalotcorp.com` when a Hot opportunity is found. See
[`docs/active-cleaning-opportunities.md`](docs/active-cleaning-opportunities.md) for the
architecture, roles, sources, and how to enable the daily collection job.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

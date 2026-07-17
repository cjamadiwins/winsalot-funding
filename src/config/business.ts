// Edit this file to update the business information shown on the landing
// page (/commercial-cleaning-quote). No other file should need to change
// for basic content updates.
//
// This page is intentionally brand-neutral so the same codebase can be
// reused for different commercial cleaning clients and ad campaigns —
// avoid adding a specific company name, city, or fixed pricing here.
//
// Notification destinations (where SMS + backup email alerts are sent) are
// controlled by environment variables, not this file, so they can be
// changed per-environment without a code change. See .env.example.

export const businessConfig = {
  name: "Professional Commercial & Home Cleaning Services",

  // Shown on buttons like "Call the Quote Team" and in the contact section.
  // `display` is what customers see, `href` is what the tel: link dials.
  phone: {
    display: "(647) 300-1270",
    href: "+16473001270",
  },

  email: "info@winsalotcorp.com",

  // Free-text, shown in the contact section.
  hours: "Monday to Saturday, 8:00 AM to 6:00 PM",

  // Kept generic on purpose — see note at the top of this file.
  serviceAreaSummary: "your area",

  // Fulfillment arrangement: Winsalot Corp handles inbound calls and quote
  // requests on the cleaning provider's behalf. This is disclosed near the
  // quote form and contact section so customers know who reaches out first.
  fulfillmentPartner: {
    name: "Winsalot Corp",
    statement: "Quote requests are managed by Winsalot Corp on behalf of the cleaning provider.",
    responsibilities: [
      "Receive the inquiry",
      "Contact and qualify the prospect",
      "Confirm the service, location and preferred date",
      "Coordinate the introduction to the cleaning provider",
      "Help manage follow-ups until the customer books or declines",
    ],
  },
} as const;

export type BusinessConfig = typeof businessConfig;

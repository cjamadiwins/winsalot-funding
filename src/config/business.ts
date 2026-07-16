// Edit this file to update the business information shown on the
// Afsoon Cleaning Team landing page (/afsoon-cleaning). No other file
// should need to change for basic content/pricing updates.
//
// Notification destinations (where SMS + backup email alerts are sent) are
// controlled by environment variables, not this file, so they can be
// changed per-environment without a code change. See .env.example.

export const businessConfig = {
  name: "Afsoon Cleaning Team",

  // Shown on buttons like "Call Now" and in the contact section.
  // `display` is what customers see, `href` is what the tel: link dials.
  phone: {
    display: "(647) 300-1270",
    href: "+16473001270",
  },

  email: "info@winsalotcorp.com",

  // Free-text, shown in the contact section.
  hours: "Monday to Saturday, 8:00 AM to 6:00 PM",

  serviceAreas: ["Toronto", "Greater Toronto Area"],
  serviceAreaSummary: "Toronto and the Greater Toronto Area",

  pricing: {
    gta: {
      label: "Greater Toronto Area",
      minRate: 35,
      maxRate: 37,
      unit: "per hour",
    },
    toronto: {
      label: "Toronto",
      rate: 50,
      unit: "per hour",
    },
    travelTimeNote: "One additional hour of travel time may be charged.",
    disclaimer:
      "Final pricing is confirmed after reviewing the location, property size, cleaning requirements and requested schedule.",
  },
} as const;

export type BusinessConfig = typeof businessConfig;

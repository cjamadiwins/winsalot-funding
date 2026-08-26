import "server-only";

// Single source of truth for every "From"/"Reply-To" identity this app's
// Growth-side products (consultation booking, business-financing
// opportunities, and the admin-only Invoices feature) send email from.
// Before this module existed, every send site read its own ad-hoc
// `process.env.EMAIL_FROM` fallback independently - one shared env var
// controlled the sender for consultations, opportunity follow-ups, *and*
// very nearly invoices, with no way to give one category its own
// identity without accidentally changing another's. Each category below
// has its own isolated override var instead, so a misconfiguration (or a
// deliberate change) in one category can never bleed into another -
// "safe fallbacks that never mix the Growth and Cleaning systems."
//
// The retired commercial-cleaning-quote system (`quotes@winsalotcorp.com`)
// has no live send path left in this codebase (see docs/crm.md's stale
// "Quote email control" section, and AGENTS.md/PR history for the
// cleaning->Growth CRM pivot) - it's still defined here, reserved and
// fully isolated, so if that capability is ever reintroduced it has a
// correct identity from day one and can never be reached by
// getEmailSender("growth"/"funding"/"billing").

export type EmailCategory = "growth" | "funding" | "billing" | "quotes";

const SENDER_DEFAULTS: Record<EmailCategory, { displayName: string; address: string }> = {
  // Growth consultations: bookings, confirmations, reminders,
  // rescheduling, cancellations, and the sales-prospect (opportunity)
  // consultation-invite/follow-up emails for lead_generation and
  // both_services opportunities.
  growth: { displayName: "Winsalot Growth", address: "growth@winsalotcorp.com" },
  // Business-financing opportunity emails (opportunity_type ===
  // "business_financing").
  funding: { displayName: "Winsalot Funding", address: "funding@winsalotcorp.com" },
  // Invoices, payment reminders, and payment receipts.
  billing: { displayName: "Winsalot Billing", address: "billing@winsalotcorp.com" },
  // Reserved for the retired cleaning-quote system - see module comment.
  quotes: { displayName: "Winsalot Quotes", address: "quotes@winsalotcorp.com" },
};

// Namespaced per category on purpose - see module comment above.
const SENDER_OVERRIDE_ENV_VAR: Record<EmailCategory, string> = {
  growth: "GROWTH_EMAIL_FROM",
  funding: "FUNDING_EMAIL_FROM",
  billing: "BILLING_EMAIL_FROM",
  quotes: "QUOTES_EMAIL_FROM",
};

// The one Reply-To address every email category shares, per the brief -
// deliberately not overridable per-category (a single shared inbox is
// the point), but still admin-configurable app-wide via EMAIL_REPLY_TO
// for environments (e.g. staging) that shouldn't reply into the real
// inbox.
const DEFAULT_REPLY_TO = "info@winsalotcorp.com";

export function getEmailSender(category: EmailCategory): string {
  const override = process.env[SENDER_OVERRIDE_ENV_VAR[category]];
  if (override) return override;
  const { displayName, address } = SENDER_DEFAULTS[category];
  return `${displayName} <${address}>`;
}

export function getEmailReplyTo(): string {
  return process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO;
}

// crm_opportunities can be lead_generation, business_financing, or
// both_services - a sales-prospect email about *booking the free
// consultation* is fundamentally a Growth-consultation email regardless
// of which service(s) the prospect is interested in, except when the
// opportunity is purely business-financing, where the Funding identity
// is the correct one.
export function senderForOpportunityType(opportunityType: "lead_generation" | "business_financing" | "both_services"): string {
  return getEmailSender(opportunityType === "business_financing" ? "funding" : "growth");
}

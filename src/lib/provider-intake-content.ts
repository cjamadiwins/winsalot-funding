// Plain content for the provider intake email - deliberately without the
// "server-only" guard (unlike provider-intake-email.ts) so it can also be
// imported by the client-side "Send Intake Form" confirmation modal to
// show the agent exactly what will be sent before they send it (brief
// section 5). Pure string formatting only - no secrets, no server-only
// APIs.

// Points at the public Provider Intake Form (src/app/provider-intake,
// POST /api/provider-intake) on a dedicated path under the same
// leads.winsalotcorp.com host used by the *unrelated* Lead Generation
// Client Intake form (LEAD_GEN_HOSTS -> "/lead-generation" in
// src/proxy.ts). This used to be the bare host root, which collided with
// that other form - a provider following this link landed on the Lead
// Generation Client Intake page instead, filled in fields that don't
// describe a cleaning provider (target industry, leads per month, etc.),
// and the submission saved to `lead_generation`, never reaching
// provider_leads. The dedicated path fixes that without touching the Lead
// Generation Client Intake form or its host-root mapping.
export const PROVIDER_INTAKE_URL = "https://leads.winsalotcorp.com/provider-intake";

export const PROVIDER_INTAKE_EMAIL_SUBJECT = "Complete Your Winsalot Cleaning Provider Intake Form";

export function firstNameFrom(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

export function buildProviderIntakeEmailText(contactName: string): string {
  const firstName = firstNameFrom(contactName);

  return [
    `Hello ${firstName},`,
    "",
    "Thank you for speaking with us.",
    "",
    "Winsalot Corp is currently expanding its network of professional cleaning providers across Canada.",
    "",
    "Please complete our short cleaning provider intake form so we can learn more about your business, the services you provide, and the areas you serve.",
    "",
    "Completing the form does not obligate you to accept any cleaning opportunity.",
    "",
    `Complete Provider Intake Form: ${PROVIDER_INTAKE_URL}`,
    "",
    "Once your information has been submitted, our team will review your application and contact you regarding suitable opportunities.",
    "",
    "Thank you,",
    "Winsalot Corp",
    "Empowering Businesses, One Solution at a Time",
    "647-300-1270",
  ].join("\n");
}

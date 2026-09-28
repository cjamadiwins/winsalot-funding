// Lead Generation CRM: Client Call Script - pure, framework-free script
// building. Deliberately has no "server-only"/Supabase-client code (unlike
// most lib/leadgen-*.ts files) since it's imported directly by client
// components (ClientCallScriptSelector, the Call List "View Call Script"
// panels) so the exact same script always renders instantly on selection
// change, with no extra round trip to the server. See
// supabase/migrations/20260928030000_leadgen_client_call_scripts.sql for
// the five leadgen_clients columns this reads.

import type { LeadgenClientRow } from "@/lib/leadgen-types";

export type LeadgenCallScriptClientFields = Pick<
  LeadgenClientRow,
  "name" | "call_script_value_proposition" | "call_script_services" | "call_script_closing" | "call_script_notes" | "call_script_override"
>;

// Safe generic fallbacks - shown only until Admin fills in a client's own
// wording (brief: "Do not use one generic service description for every
// client"), so a brand-new client always renders a complete, sensible
// script rather than a blank/broken one.
export const LEADGEN_CALL_SCRIPT_DEFAULT_VALUE_PROPOSITION =
  "We help businesses improve or build their website and generate more customer inquiries through SEO.";
export const LEADGEN_CALL_SCRIPT_DEFAULT_SERVICES = "improving their website and generating more leads online";

const PLACEHOLDER_PROSPECT_NAME = "[Prospect Business Name]";
const PLACEHOLDER_AGENT_NAME = "[Agent Name]";

// Fills the four brief-mandated dynamic fields wherever they appear in a
// piece of admin-written text (the full override, or the optional closing
// line) - so an admin can freely reuse the same [Bracket] placeholders in
// their own custom wording and have them resolve exactly like the
// built-in template does.
function substitutePlaceholders(
  text: string,
  vars: { agentName: string; clientBusinessName: string; prospectBusinessName: string; services: string }
): string {
  return text
    .replace(/\[Agent Name\]/gi, vars.agentName)
    .replace(/\[Client Business Name\]/gi, vars.clientBusinessName)
    .replace(/\[Prospect Business Name\]/gi, vars.prospectBusinessName)
    .replace(/\[Client-Specific Services\]/gi, vars.services);
}

export type LeadgenBuiltCallScript = {
  // True when this client has its own complete "Client Call Script"
  // override - opening/ifInterested are null in that case (fullText is
  // the entire script, verbatim except for placeholder substitution).
  isCustomOverride: boolean;
  opening: string[] | null;
  ifInterested: string | null;
  closing: string | null;
  // Internal Agent Notes - never part of fullText (never meant to be read
  // aloud to the prospect); rendered as its own separate, clearly-labeled
  // block by ClientCallScriptPanel.
  notes: string | null;
  // The complete, read-aloud script (opening + if-interested + closing,
  // or the full override) - what "Copy Script" copies.
  fullText: string;
};

// Builds the exact script an agent should read for one client/prospect
// pair. Never mutates or reads anything beyond the plain fields passed in
// - the CRM determines which client's script to build purely from the
// lead/appointment/campaign's own client_id (see the callers), so an
// agent never has to remember which script belongs to which client.
export function buildLeadgenCallScript(input: {
  agentName: string;
  // Blank/omitted while previewing a client's script with no specific
  // prospect in context (e.g. the dashboard card) - renders the literal
  // "[Prospect Business Name]" placeholder in that case, exactly like the
  // brief's own template wording.
  prospectBusinessName?: string;
  client: LeadgenCallScriptClientFields;
}): LeadgenBuiltCallScript {
  const agentName = input.agentName.trim() || PLACEHOLDER_AGENT_NAME;
  const prospectName = input.prospectBusinessName?.trim() || PLACEHOLDER_PROSPECT_NAME;
  const clientName = input.client.name;
  const services = input.client.call_script_services?.trim() || LEADGEN_CALL_SCRIPT_DEFAULT_SERVICES;
  const vars = { agentName, clientBusinessName: clientName, prospectBusinessName: prospectName, services };

  const notes = input.client.call_script_notes?.trim() || null;

  const override = input.client.call_script_override?.trim();
  if (override) {
    return {
      isCustomOverride: true,
      opening: null,
      ifInterested: null,
      closing: null,
      notes,
      fullText: substitutePlaceholders(override, vars),
    };
  }

  const valueProposition = input.client.call_script_value_proposition?.trim() || LEADGEN_CALL_SCRIPT_DEFAULT_VALUE_PROPOSITION;
  const opening = [
    `Hi, is this ${prospectName}?`,
    `Great — my name is ${agentName}, calling from Winsalot Corp on behalf of ${clientName}. ${valueProposition}`,
    "I just wanted to ask — are you currently looking to improve your website or get more leads online?",
  ];
  const ifInterested = `Perfect. ${clientName} can help with ${services}. I'd like to arrange a quick consultation so you can see what would make sense for your business. Would [day/time] work?`;
  const closingRaw = input.client.call_script_closing?.trim() || null;
  const closing = closingRaw ? substitutePlaceholders(closingRaw, vars) : null;

  const fullText = [opening.join(" "), ifInterested, closing].filter(Boolean).join("\n\n");

  return { isCustomOverride: false, opening, ifInterested, closing, notes, fullText };
}

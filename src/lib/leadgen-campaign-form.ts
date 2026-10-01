import { CALL_SCRIPT_MAX_LENGTH, normalizeScriptText } from "./call-list-script-shared";

// Client-safe validation/normalisation for the Admin "New Campaign" / "Edit
// Campaign" modal on the Lead Generation Call List Assignment panel. Writes go
// to the existing leadgen_campaigns table (plus leadgen_campaign_agents and the
// Admin-only leadgen_campaign_admin_notes) - there is no separate campaign model.

export const CAMPAIGN_STATUSES = ["active", "paused", "completed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_NAME_MAX = 120;
export const CAMPAIGN_FIELD_MAX = 200;
export const CAMPAIGN_DESCRIPTION_MAX = 2000;
export const CAMPAIGN_NOTES_MAX = 4000;

export type CampaignFormInput = {
  name: string;
  industry: string;
  territory: string;
  description: string;
  script: string;
  status: string;
  startDate: string;
  adminNotes: string;
  agentIds: string[];
};

export type CampaignFields = {
  name: string;
  target_industry: string | null;
  territory: string | null;
  description: string | null;
  call_script_text: string | null;
  status: CampaignStatus;
  start_date: string | null;
};

export type ValidatedCampaign = { fields: CampaignFields; adminNotes: string; agentIds: string[] };

const blankToNull = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
};

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCampaignForm(input: CampaignFormInput): { error: string } | ({ error?: undefined } & ValidatedCampaign) {
  const name = input.name.trim();
  if (!name) return { error: "Campaign name is required." };
  if (name.length > CAMPAIGN_NAME_MAX) return { error: `Campaign name is too long (max ${CAMPAIGN_NAME_MAX} characters).` };
  for (const [label, value] of [["Industry / niche", input.industry], ["City / territory", input.territory]] as const) {
    if (value.trim().length > CAMPAIGN_FIELD_MAX) return { error: `${label} is too long (max ${CAMPAIGN_FIELD_MAX} characters).` };
  }
  if (input.description.trim().length > CAMPAIGN_DESCRIPTION_MAX) return { error: `The description is too long (max ${CAMPAIGN_DESCRIPTION_MAX} characters).` };
  if (!isCampaignStatus(input.status)) return { error: "Choose Active, Paused or Completed." };
  const startDate = input.startDate.trim();
  if (startDate && !isRealDate(startDate)) return { error: "Start date must be a valid date." };
  const script = normalizeScriptText(input.script);
  if (script && script.length > CALL_SCRIPT_MAX_LENGTH) return { error: `The call script is too long (max ${CALL_SCRIPT_MAX_LENGTH} characters).` };
  const adminNotes = input.adminNotes.trim();
  if (adminNotes.length > CAMPAIGN_NOTES_MAX) return { error: `Admin notes are too long (max ${CAMPAIGN_NOTES_MAX} characters).` };

  return {
    fields: {
      name,
      target_industry: blankToNull(input.industry),
      territory: blankToNull(input.territory),
      description: blankToNull(input.description),
      call_script_text: script,
      status: input.status,
      start_date: startDate || null,
    },
    adminNotes,
    agentIds: [...new Set(input.agentIds)],
  };
}

// Script precedence for a list's agents: the list's own custom script, then the
// campaign's, then the client's. Blank at every level above the client keeps the
// existing client-level behaviour exactly as before.
export function resolveScriptOverride(input: { listText?: string | null; campaignText?: string | null; clientOverride?: string | null }): string | null {
  return normalizeScriptText(input.listText) ?? normalizeScriptText(input.campaignText) ?? input.clientOverride ?? null;
}

// What the Admin modal edits for an existing campaign (and what a create/update
// returns so the panel can show it immediately).
export type CampaignDetail = {
  id: string;
  clientId: string;
  name: string;
  industry: string;
  territory: string;
  description: string;
  script: string;
  status: CampaignStatus;
  startDate: string;
  adminNotes: string;
  agentIds: string[];
};

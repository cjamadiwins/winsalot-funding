"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LEADGEN_CAMPAIGN_STATUSES, type LeadgenCampaignStatus } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCsvList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStatus(value: FormDataEntryValue | null): LeadgenCampaignStatus {
  const status = String(value ?? "");
  return (LEADGEN_CAMPAIGN_STATUSES as readonly string[]).includes(status) ? (status as LeadgenCampaignStatus) : "active";
}

// "Campaign Setup" (Phase 1 of Campaign & Payment Setup, brief section 18):
// every field this writes is admin-only by construction, not just by this
// gate - leadgen_campaigns_admin_all is the only write policy on the
// table, so even a compromised/misused server action here still can't
// grant a client or agent write access; this action only adds a path an
// admin can already reach at the database level. Uses the service-role
// client (like createAndLinkLeadgenClientAction above it) because a
// Growth CRM admin's auth.uid() may have no matching leadgen_users row at
// all (Growth CRM admin and Lead Gen CRM admin are separate identities),
// so the regular RLS-bound client can't be relied on here.
export async function updateLeadgenCampaignConfigAction(crmClientId: string, leadgenClientId: string, campaignId: string | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a campaign name." };

  const fields = {
    name,
    status: parseStatus(formData.get("status")),
    start_date: String(formData.get("start_date") ?? "").trim() || null,
    campaign_type: String(formData.get("campaign_type") ?? "").trim() || null,
    service_type: String(formData.get("service_type") ?? "").trim() || null,
    target_industry: String(formData.get("target_industry") ?? "").trim() || null,
    secondary_industries: parseCsvList(formData.get("secondary_industries")),
    territory: String(formData.get("territory") ?? "").trim() || null,
    qualification_criteria: parseList(formData.get("qualification_criteria")),
    assigned_team: String(formData.get("assigned_team") ?? "").trim() || null,
    current_stage: String(formData.get("current_stage") ?? "").trim() || null,
  };

  if (campaignId) {
    const { error } = await supabaseAdmin.from("leadgen_campaigns").update(fields).eq("id", campaignId).eq("client_id", leadgenClientId);
    if (error) return { error: `Failed to update campaign setup: ${error.message}` };
  } else {
    const { error } = await supabaseAdmin.from("leadgen_campaigns").insert({ ...fields, client_id: leadgenClientId, created_by: admin.id });
    if (error) return { error: `Failed to create campaign setup: ${error.message}` };
  }

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

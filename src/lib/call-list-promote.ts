import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { normalizeDncEmail, normalizePhoneNumber } from "./dnc-suppression";
import { getSegmentLead, markSegmentLeadPromoted } from "./call-list-leads";
import { getSegment } from "./call-list-segments";

// "Where appropriate, allow an Interested or Qualified record from the
// Call List to be promoted into the CRM's existing Lead/Prospect/
// Opportunity" (brief item 9) - a deliberate, one-at-a-time action, not
// something every uploaded/dialed row goes through automatically. That's
// what keeps a large raw call list from flooding the qualified pipeline
// with every "No Answer"/"Voicemail" dial attempt.
//
// Both functions first check for an existing pipeline record that's
// plainly the same contact (by phone, else business name) and link to it
// instead of inserting a second one ("Avoid duplicate records").

export type PromoteResult = { id: string; linkedExisting: boolean } | { error: string };

function normalizeBusinessKey(businessName: string | null | undefined, city: string | null | undefined): string | null {
  const name = (businessName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const cityPart = (city ?? "").trim().toLowerCase();
  return name ? `${name}|${cityPart}` : null;
}

export async function promoteToGrowthOpportunity(callListLeadId: string, promotedBy: string, assignedAgentId?: string | null): Promise<PromoteResult> {
  const lead = await getSegmentLead(callListLeadId);
  if (!lead) return { error: "This call list lead no longer exists." };
  if (lead.promoted_opportunity_id) return { id: lead.promoted_opportunity_id, linkedExisting: true };

  const segment = await getSegment(lead.segment_id);
  if (!segment || segment.crm !== "growth" || !segment.growth_opportunity_type) {
    return { error: "This segment isn't set up for the Growth CRM pipeline." };
  }

  const admin = getSupabaseAdmin();
  const normalizedPhone = normalizePhoneNumber(lead.phone);
  const businessKey = normalizeBusinessKey(lead.business_name, lead.city);

  const { data: existingRows } = await admin.from("crm_opportunities").select("id, business_name, phone, city");
  const existing = (existingRows ?? []).find((row) => {
    const phone = normalizePhoneNumber(row.phone as string | null);
    if (normalizedPhone && phone === normalizedPhone) return true;
    const key = normalizeBusinessKey(row.business_name as string | null, row.city as string | null);
    return businessKey !== null && key === businessKey;
  });

  if (existing) {
    await markSegmentLeadPromoted(lead.id, { opportunityId: existing.id as string });
    return { id: existing.id as string, linkedExisting: true };
  }

  const { data: created, error } = await admin
    .from("crm_opportunities")
    .insert({
      opportunity_type: segment.growth_opportunity_type,
      business_name: lead.business_name,
      contact_name: lead.contact_name,
      phone: lead.phone || "",
      email: lead.email,
      city: lead.city,
      province_state: lead.province,
      industry: lead.industry,
      website: lead.website,
      source_notes: lead.notes,
      call_list_segment_id: segment.id,
      assigned_agent_id: assignedAgentId ?? lead.assigned_agent_id ?? null,
      created_by: promotedBy,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Failed to create the opportunity." };

  await markSegmentLeadPromoted(lead.id, { opportunityId: created.id as string });
  return { id: created.id as string, linkedExisting: false };
}

export async function promoteToLeadgenLead(callListLeadId: string, promotedBy: string, assignedAgentId?: string | null): Promise<PromoteResult> {
  const lead = await getSegmentLead(callListLeadId);
  if (!lead) return { error: "This call list lead no longer exists." };
  if (lead.promoted_leadgen_lead_id) return { id: lead.promoted_leadgen_lead_id, linkedExisting: true };

  const segment = await getSegment(lead.segment_id);
  if (!segment || segment.crm !== "lead_generation" || !segment.leadgen_campaign_id) {
    return { error: "This segment isn't set up for the Lead Generation CRM pipeline." };
  }

  const admin = getSupabaseAdmin();
  const { data: campaign } = await admin.from("leadgen_campaigns").select("client_id").eq("id", segment.leadgen_campaign_id).maybeSingle();
  if (!campaign) return { error: "The campaign linked to this segment no longer exists." };

  const normalizedPhone = normalizePhoneNumber(lead.phone);
  const normalizedEmail = normalizeDncEmail(lead.email);
  const businessKey = normalizeBusinessKey(lead.business_name, lead.city);

  const { data: existingRows } = await admin.from("leadgen_leads").select("id, business_name, phone, email, city").eq("client_id", campaign.client_id);
  const existing = (existingRows ?? []).find((row) => {
    const phone = normalizePhoneNumber(row.phone as string | null);
    if (normalizedPhone && phone === normalizedPhone) return true;
    const email = normalizeDncEmail(row.email as string | null);
    if (normalizedEmail && email === normalizedEmail) return true;
    const key = normalizeBusinessKey(row.business_name as string | null, row.city as string | null);
    return businessKey !== null && key === businessKey;
  });

  if (existing) {
    await markSegmentLeadPromoted(lead.id, { leadgenLeadId: existing.id as string });
    return { id: existing.id as string, linkedExisting: true };
  }

  const { data: created, error } = await admin
    .from("leadgen_leads")
    .insert({
      client_id: campaign.client_id,
      campaign_id: segment.leadgen_campaign_id,
      business_name: lead.business_name,
      contact_name: lead.contact_name,
      phone: lead.phone,
      email: lead.email,
      website: lead.website,
      city: lead.city,
      province: lead.province,
      industry: lead.industry,
      source_notes: lead.notes,
      call_list_segment_id: segment.id,
      assigned_agent_id: assignedAgentId ?? lead.assigned_agent_id ?? null,
      created_by: promotedBy,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Failed to create the lead." };

  await markSegmentLeadPromoted(lead.id, { leadgenLeadId: created.id as string });
  return { id: created.id as string, linkedExisting: false };
}

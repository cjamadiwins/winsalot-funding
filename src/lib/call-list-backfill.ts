import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { normalizeDncEmail, normalizePhoneNumber } from "./dnc-suppression";
import type { MappedLeadRow } from "./call-list-column-mapping";
import type { CallListCrm, CallListLeadRow } from "./call-list-types";

// "Situation B" from the brief: a segment was imported before street
// address/postal code/country existed as fields (or before an Admin
// mapped them), so those columns are genuinely empty in the database -
// never guessed or invented here. This lets an Admin re-upload the exact
// same LeadSwift export (or any file with matching business/phone/email
// columns) purely to fill in the missing location fields on the EXISTING
// call_list_leads rows - and, where a row has already been promoted, on
// the resulting crm_opportunities/leadgen_leads record too, since that's
// the "older prospects show city correctly, newer ones show —" gap the
// brief describes.
//
// Deliberately conservative in every direction:
//   * Never inserts a new call_list_leads row - a CSV row that matches
//     nothing in the segment is simply reported back as unmatched, never
//     created (that's what the normal Upload flow is for).
//   * Matches by phone, then email, then business name - but a
//     business-name match is only ever used when it's unambiguous (found
//     exactly one row in the segment with that name); otherwise it's
//     safer to skip than to risk writing one business's address onto a
//     different business's record.
//   * Only ever fills a currently-blank location field. A location field
//     that already has a value (however it got there) is never
//     overwritten - this can only add missing data, never change existing
//     data, so it can't undo a correction an Admin already made.
//   * Never touches business_name, contact_name, phone, email, website,
//     industry, notes, assigned_agent_id, promoted_*, last_outcome,
//     last_contacted_at, callback_at, or anything on the promoted
//     opportunity/lead besides its own location fields (stage, notes,
//     assignment, call history, statuses are all untouched).
const LOCATION_FIELDS = ["street_address", "city", "province", "postal_code", "country"] as const;

export type BackfillSummary = {
  rowsInFile: number;
  matched: number;
  callListLeadsUpdated: number;
  promotedRecordsUpdated: number;
  unmatched: number;
};

function normalizeBusinessName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function backfillSegmentLocationsFromFile(segmentId: string, crm: CallListCrm, mappedRows: MappedLeadRow[]): Promise<BackfillSummary> {
  const admin = getSupabaseAdmin();

  const { data: existingRows, error: fetchError } = await admin.from("call_list_leads").select("*").eq("segment_id", segmentId);
  if (fetchError) throw new Error(fetchError.message);
  const leads = (existingRows ?? []) as CallListLeadRow[];

  const byPhone = new Map<string, CallListLeadRow>();
  const byEmail = new Map<string, CallListLeadRow>();
  const byBusinessName = new Map<string, CallListLeadRow[]>();
  for (const lead of leads) {
    const phone = normalizePhoneNumber(lead.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, lead);
    const email = normalizeDncEmail(lead.email);
    if (email && !byEmail.has(email)) byEmail.set(email, lead);
    const nameKey = normalizeBusinessName(lead.business_name);
    if (nameKey) byBusinessName.set(nameKey, [...(byBusinessName.get(nameKey) ?? []), lead]);
  }

  const summary: BackfillSummary = { rowsInFile: mappedRows.length, matched: 0, callListLeadsUpdated: 0, promotedRecordsUpdated: 0, unmatched: 0 };

  for (const row of mappedRows) {
    if (!row.business_name && !row.phone && !row.email) continue; // skip fully blank rows, same as the upload flow

    let match: CallListLeadRow | undefined;
    const phone = normalizePhoneNumber(row.phone);
    const email = normalizeDncEmail(row.email);
    if (phone && byPhone.has(phone)) match = byPhone.get(phone);
    else if (email && byEmail.has(email)) match = byEmail.get(email);
    else {
      const nameKey = normalizeBusinessName(row.business_name);
      const candidates = nameKey ? byBusinessName.get(nameKey) : undefined;
      if (candidates && candidates.length === 1) match = candidates[0];
    }

    if (!match) {
      summary.unmatched += 1;
      continue;
    }
    summary.matched += 1;

    const callListPatch: Record<string, string> = {};
    for (const field of LOCATION_FIELDS) {
      const currentValue = (match[field as keyof CallListLeadRow] as string | null) ?? "";
      const newValue = row[field];
      if (!currentValue.trim() && newValue.trim()) callListPatch[field] = newValue.trim();
    }

    if (Object.keys(callListPatch).length > 0) {
      const { error } = await admin.from("call_list_leads").update(callListPatch).eq("id", match.id);
      if (error) throw new Error(error.message);
      summary.callListLeadsUpdated += 1;
    }

    // Merge what the CSV has with what was already on the call_list_leads
    // row (including anything just patched above) before pushing to the
    // promoted record, so a field that was already filled on the staging
    // row also reaches a prospect that's missing it.
    const mergedForPromoted: Record<string, string> = {};
    for (const field of LOCATION_FIELDS) {
      const value = callListPatch[field] ?? (match[field as keyof CallListLeadRow] as string | null) ?? "";
      if (value.trim()) mergedForPromoted[field] = value.trim();
    }

    if (crm === "growth" && match.promoted_opportunity_id) {
      const updated = await backfillPromotedOpportunity(match.promoted_opportunity_id, mergedForPromoted);
      if (updated) summary.promotedRecordsUpdated += 1;
    } else if (crm === "lead_generation" && match.promoted_leadgen_lead_id) {
      const updated = await backfillPromotedLeadgenLead(match.promoted_leadgen_lead_id, mergedForPromoted);
      if (updated) summary.promotedRecordsUpdated += 1;
    }
  }

  return summary;
}

async function backfillPromotedOpportunity(opportunityId: string, merged: Record<string, string>): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: opportunity } = await admin
    .from("crm_opportunities")
    .select("street_address, city, province_state, postal_code, country")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opportunity) return false;

  const fieldMap: Record<string, keyof typeof opportunity> = {
    street_address: "street_address",
    city: "city",
    province: "province_state",
    postal_code: "postal_code",
    country: "country",
  };

  const patch: Record<string, string> = {};
  for (const [sourceField, targetColumn] of Object.entries(fieldMap)) {
    const currentValue = ((opportunity as Record<string, unknown>)[targetColumn] as string | null) ?? "";
    const newValue = merged[sourceField];
    if (!currentValue.trim() && newValue) patch[targetColumn] = newValue;
  }
  if (Object.keys(patch).length === 0) return false;

  const { error } = await admin.from("crm_opportunities").update(patch).eq("id", opportunityId);
  if (error) throw new Error(error.message);
  return true;
}

async function backfillPromotedLeadgenLead(leadId: string, merged: Record<string, string>): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: lead } = await admin.from("leadgen_leads").select("street_address, city, province, postal_code, country").eq("id", leadId).maybeSingle();
  if (!lead) return false;

  const patch: Record<string, string> = {};
  for (const field of LOCATION_FIELDS) {
    const currentValue = ((lead as Record<string, unknown>)[field] as string | null) ?? "";
    const newValue = merged[field];
    if (!currentValue.trim() && newValue) patch[field] = newValue;
  }
  if (Object.keys(patch).length === 0) return false;

  const { error } = await admin.from("leadgen_leads").update(patch).eq("id", leadId);
  if (error) throw new Error(error.message);
  return true;
}

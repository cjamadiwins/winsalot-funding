import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { mapDncSuppressionsByContacts, normalizeDncEmail, normalizePhoneNumber } from "./dnc-suppression";
import type { CallListTargetField, MappedLeadRow } from "./call-list-column-mapping";
import type { CallListCrm, CallListLeadRow } from "./call-list-types";

// Staging/working CRUD for a Call List Segment's rows (call_list_leads),
// plus the duplicate/DNC-flagging pass described in the migration's
// header comment. This is the module the spreadsheet editor, the upload
// action, and the agent working view all go through.

function normalizeBusinessKey(businessName: string | null | undefined, city: string | null | undefined): string | null {
  const name = (businessName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const cityPart = (city ?? "").trim().toLowerCase();
  return name ? `${name}|${cityPart}` : null;
}

export async function listSegmentLeads(segmentId: string): Promise<CallListLeadRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("call_list_leads")
    .select("*")
    .eq("segment_id", segmentId)
    .is("removed_at", null)
    .order("source_row_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as CallListLeadRow[];
}

// Rows an Admin removed from this segment's active list (see
// removeSegmentLeads below) - never permanently deleted, just hidden from
// every "active list" query above until restored.
export async function listRemovedSegmentLeads(segmentId: string): Promise<CallListLeadRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("call_list_leads")
    .select("*")
    .eq("segment_id", segmentId)
    .not("removed_at", "is", null)
    .order("removed_at", { ascending: false });
  return (data ?? []) as CallListLeadRow[];
}

export async function getSegmentLead(id: string): Promise<CallListLeadRow | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("call_list_leads").select("*").eq("id", id).maybeSingle();
  return (data as CallListLeadRow) ?? null;
}

// Chunked so a large LeadSwift export (thousands of rows) never hits a
// single request's practical payload/row limits.
const INSERT_CHUNK_SIZE = 500;

export async function bulkInsertSegmentLeads(segmentId: string, rows: MappedLeadRow[], createdBy: string): Promise<number> {
  const admin = getSupabaseAdmin();
  let inserted = 0;

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const payload = chunk
      .filter((row) => row.business_name || row.phone) // skip fully blank rows
      .map((row, offset) => ({
        segment_id: segmentId,
        source_row_number: i + offset + 1,
        business_name: row.business_name || "Unknown business",
        contact_name: row.contact_name || null,
        phone: row.phone || null,
        email: row.email || null,
        website: row.website || null,
        city: row.city || null,
        province: row.province || null,
        industry: row.industry || null,
        notes: row.notes || null,
        extra_fields: row.extra_fields,
        created_by: createdBy,
      }));
    if (payload.length === 0) continue;
    const { error, count } = await admin.from("call_list_leads").insert(payload, { count: "exact" });
    if (error) throw new Error(`Failed to import rows: ${error.message}`);
    inserted += count ?? payload.length;
  }

  return inserted;
}

export type SegmentLeadEditableFields = Partial<Record<CallListTargetField, string>> & { extra_fields?: Record<string, string> };

export async function updateSegmentLeadFields(id: string, patch: SegmentLeadEditableFields): Promise<void> {
  const admin = getSupabaseAdmin();
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "extra_fields") {
      update.extra_fields = value;
    } else if (key === "business_name") {
      update.business_name = (value as string) || "Unknown business";
    } else {
      update[key] = (value as string) || null;
    }
  }
  const { error } = await admin.from("call_list_leads").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addManualSegmentLead(
  segmentId: string,
  fields: Partial<Record<CallListTargetField, string>>,
  createdBy: string
): Promise<CallListLeadRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("call_list_leads")
    .insert({
      segment_id: segmentId,
      business_name: fields.business_name || "Unknown business",
      contact_name: fields.contact_name || null,
      phone: fields.phone || null,
      email: fields.email || null,
      website: fields.website || null,
      city: fields.city || null,
      province: fields.province || null,
      industry: fields.industry || null,
      notes: fields.notes || null,
      extra_fields: {},
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to add the row.");
  return data as CallListLeadRow;
}

// Reversible "safe delete" for cleaning an imported call list - never a
// real DELETE. Removed rows simply drop out of listSegmentLeads (and
// therefore out of the spreadsheet editor, the agent working view, CSV
// export, and duplicate re-checks) until an Admin restores them. Because
// crm_call_logs/leadgen_call_logs only ever reference call_list_lead_id
// with "on delete set null" (never cascade), this never touches Call Logs,
// outcomes, notes, callbacks, or appointments either way.
export async function removeSegmentLeads(ids: string[], removedBy: string): Promise<void> {
  if (ids.length === 0) return;
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("call_list_leads")
    .update({ removed_at: new Date().toISOString(), removed_by: removedBy })
    .in("id", ids)
    .is("removed_at", null);
  if (error) throw new Error(error.message);
}

export async function restoreSegmentLeads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("call_list_leads")
    .update({ removed_at: null, removed_by: null })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

// Called by the call-logging server action right after a new
// crm_call_logs/leadgen_call_logs row is inserted, so the working list
// view can show each lead's current state without joining the full call
// history every time. The call log rows remain the single source of
// truth - this is a read-model convenience only.
export async function updateSegmentLeadCallState(
  id: string,
  state: { lastOutcome: string; lastContactedAt: string; callbackAt?: string | null }
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("call_list_leads")
    .update({
      last_outcome: state.lastOutcome,
      last_contacted_at: state.lastContactedAt,
      ...(state.callbackAt !== undefined ? { callback_at: state.callbackAt } : {}),
    })
    .eq("id", id);
}

export async function markSegmentLeadPromoted(
  id: string,
  promoted: { opportunityId?: string; leadgenLeadId?: string }
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("call_list_leads")
    .update({
      promoted_opportunity_id: promoted.opportunityId ?? null,
      promoted_leadgen_lead_id: promoted.leadgenLeadId ?? null,
      promoted_at: new Date().toISOString(),
    })
    .eq("id", id);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

// "Export the cleaned list if needed" (brief item 11) - a flat CSV of
// every current row (post-cleaning, whatever the segment's status), same
// BOM/CRLF convention as buildCallLogsCsv/buildDncCsv elsewhere in this
// app so Excel opens it correctly.
export function buildSegmentLeadsCsv(leads: CallListLeadRow[]): string {
  const extraKeys = [...new Set(leads.flatMap((lead) => Object.keys(lead.extra_fields ?? {})))].sort();
  const header = ["Business Name", "Contact Name", "Phone", "Email", "Website", "City", "Province", "Industry", "Notes", "Last Outcome", "Callback", ...extraKeys];
  const lines = [
    header,
    ...leads.map((lead) => [
      lead.business_name,
      lead.contact_name ?? "",
      lead.phone ?? "",
      lead.email ?? "",
      lead.website ?? "",
      lead.city ?? "",
      lead.province ?? "",
      lead.industry ?? "",
      lead.notes ?? "",
      lead.last_outcome ?? "",
      lead.callback_at ?? "",
      ...extraKeys.map((key) => lead.extra_fields?.[key] ?? ""),
    ]),
  ];
  return `﻿${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
}

export type DuplicateCheckSummary = { possibleDuplicates: number; dncFlagged: number };

// Re-checks every row currently in the segment against (a) every other
// row in the same segment and (b) this CRM's existing pipeline
// (crm_opportunities or leadgen_leads), by phone, email, and business
// name + city - and separately flags anything matching the shared Do Not
// Call list. Never deletes or merges anything; only sets/clears the flag
// columns for Admin review (brief item 4). Safe to call repeatedly (e.g.
// after every edit, or via an explicit "Re-check duplicates" button) -
// it fully recomputes both flags from scratch each time.
export async function recheckSegmentDuplicates(segmentId: string, crm: CallListCrm): Promise<DuplicateCheckSummary> {
  const admin = getSupabaseAdmin();
  const leads = await listSegmentLeads(segmentId);

  const pipelineTable = crm === "growth" ? "crm_opportunities" : "leadgen_leads";
  const { data: pipelineRows } = await admin.from(pipelineTable).select("business_name, phone, email, city");

  const pipelinePhones = new Set<string>();
  const pipelineEmails = new Set<string>();
  const pipelineBusinessKeys = new Set<string>();
  for (const row of pipelineRows ?? []) {
    const phone = normalizePhoneNumber(row.phone as string | null);
    const email = normalizeDncEmail(row.email as string | null);
    const businessKey = normalizeBusinessKey(row.business_name as string | null, row.city as string | null);
    if (phone) pipelinePhones.add(phone);
    if (email) pipelineEmails.add(email);
    if (businessKey) pipelineBusinessKeys.add(businessKey);
  }

  const seenPhones = new Map<string, string>();
  const seenEmails = new Map<string, string>();
  const seenBusinessKeys = new Map<string, string>();

  const results: { id: string; isDuplicate: boolean; reason: string | null }[] = [];

  for (const lead of leads) {
    const phone = normalizePhoneNumber(lead.phone);
    const email = normalizeDncEmail(lead.email);
    const businessKey = normalizeBusinessKey(lead.business_name, lead.city);

    let reason: string | null = null;
    if (phone && pipelinePhones.has(phone)) reason = "Phone number matches an existing CRM record.";
    else if (email && pipelineEmails.has(email)) reason = "Email matches an existing CRM record.";
    else if (businessKey && pipelineBusinessKeys.has(businessKey)) reason = "Business name + city matches an existing CRM record.";
    else if (phone && seenPhones.has(phone)) reason = "Duplicate phone number within this list.";
    else if (email && seenEmails.has(email)) reason = "Duplicate email within this list.";
    else if (businessKey && seenBusinessKeys.has(businessKey)) reason = "Duplicate business name + city within this list.";

    if (phone && !seenPhones.has(phone)) seenPhones.set(phone, lead.id);
    if (email && !seenEmails.has(email)) seenEmails.set(email, lead.id);
    if (businessKey && !seenBusinessKeys.has(businessKey)) seenBusinessKeys.set(businessKey, lead.id);

    results.push({ id: lead.id, isDuplicate: reason !== null, reason });
  }

  const dncMatches = await mapDncSuppressionsByContacts(leads.map((lead) => ({ id: lead.id, phone: lead.phone, email: lead.email })));

  await Promise.all(
    results.map((result) => {
      const dncMatch = dncMatches[result.id];
      return admin
        .from("call_list_leads")
        .update({
          is_possible_duplicate: result.isDuplicate,
          duplicate_reason: result.reason,
          dnc_flag: Boolean(dncMatch?.block_phone),
        })
        .eq("id", result.id);
    })
  );

  return {
    possibleDuplicates: results.filter((r) => r.isDuplicate).length,
    dncFlagged: Object.values(dncMatches).filter((row) => row.block_phone).length,
  };
}

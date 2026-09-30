"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseUploadedFile } from "@/lib/call-list-file-parser";
import { applyColumnMapping, buildMappableHeaders, guessColumnMapping, type CallListTargetField } from "@/lib/call-list-column-mapping";
import {
  createDraftSegment,
  deleteDraftSegment,
  getSegment,
  setSegmentTotalUploadedRows,
  updateSegmentStatus,
} from "@/lib/call-list-segments";
import {
  addManualSegmentLead,
  bulkInsertSegmentLeads,
  recheckSegmentDuplicates,
  removeSegmentLeads,
  restoreSegmentLeads,
  updateSegmentLeadFields,
  type SegmentLeadEditableFields,
} from "@/lib/call-list-leads";
import { deploySegment } from "@/lib/call-list-deploy";
import { saveLeadgenSegmentAssignment } from "@/lib/call-list-assignment";
import { saveSegmentScript } from "@/lib/call-list-script";
import { TEST_CLIENT_LIST_MESSAGE, friendlyTestClientError, isTestOnlyCampaign } from "@/lib/leadgen-test-client-guard";
import { promoteToLeadgenLead } from "@/lib/call-list-promote";
import { setHiddenColumnFields } from "@/lib/call-list-column-visibility";
import { backfillSegmentLocationsFromFile, type BackfillSummary } from "@/lib/call-list-backfill";

const BASE_PATH = "/leadgen/admin/call-list-segments";

// A single Ottawa lead moves atomically between the two approved clients.
// The database function retains the call-list ID and writes a transfer audit.
export async function transferOttawaPainterLeadAction(
  sourceSegmentId: string,
  leadId: string,
  targetCampaignId: string
): Promise<{ error?: string; destinationSegmentId?: string }> {
  const adminUser = await requireLeadgenAdmin();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![sourceSegmentId, leadId, targetCampaignId].every((id) => uuid.test(id))) return { error: "Invalid transfer selection." };
  const admin = getSupabaseAdmin();
  const { data: segment } = await admin.from("call_list_segments")
    .select("id, crm, source_file_name").eq("id", sourceSegmentId).maybeSingle();
  const { data: lead } = await admin.from("call_list_leads")
    .select("id, segment_id").eq("id", leadId).maybeSingle();
  if (segment?.crm !== "lead_generation" || !segment.source_file_name?.startsWith("campaign-125288-search-924570-painters_ottawa-on-canada")
      || lead?.segment_id !== sourceSegmentId) return { error: "This Ottawa lead is no longer in the selected segment." };
  const { data, error } = await admin.rpc("leadgen_transfer_ottawa_painter", {
    p_lead_id: leadId,
    p_target_campaign_id: targetCampaignId,
    p_admin_id: adminUser.id,
  });
  if (error || typeof data !== "string") return { error: error?.message ?? "Transfer failed." };
  revalidatePath(`${BASE_PATH}/${sourceSegmentId}`);
  revalidatePath(`${BASE_PATH}/${data}`);
  revalidatePath(BASE_PATH);
  return { destinationSegmentId: data };
}

// Step 1 of the upload wizard: parse the file and return its headers plus
// a best-effort suggested mapping, but write nothing to the database yet
// - the brief's "do NOT immediately reject the upload" when a required
// column can't be confidently identified. The Admin always sees and
// confirms (or corrects) this mapping in the Map Columns step before
// anything is created, even when the guess is already right.
export async function previewUploadFileAction(
  formData: FormData
): Promise<{ error: string } | { headers: string[]; suggestedMapping: Record<CallListTargetField, string | null>; sampleRowCount: number }> {
  await requireLeadgenAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or XLSX file to upload." };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseUploadedFile(file.name, buffer);
    const mappableHeaders = buildMappableHeaders(parsed.headers);
    return { headers: mappableHeaders, suggestedMapping: guessColumnMapping(mappableHeaders), sampleRowCount: parsed.rows.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to read this file." };
  }
}

// Step 2: the Admin has confirmed (or corrected) the column mapping from
// previewUploadFileAction - re-parses the same file (cheap - a single
// CSV/XLSX file, not a network round trip) and applies exactly the
// mapping the Admin approved, never re-guessing.
export async function uploadSegmentAction(formData: FormData): Promise<{ error: string } | void> {
  const admin = await requireLeadgenAdmin();

  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const campaignName = String(formData.get("campaign_name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const territory = String(formData.get("territory") ?? "").trim();
  const leadgenCampaignId = String(formData.get("leadgen_campaign_id") ?? "").trim();
  const mappingRaw = String(formData.get("mapping") ?? "");

  if (!name) return { error: "Segment name is required." };
  if (!leadgenCampaignId) return { error: "Select which campaign this segment is for." };
  if (await isTestOnlyCampaign(leadgenCampaignId)) return { error: TEST_CLIENT_LIST_MESSAGE };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or XLSX file to upload." };

  let mapping: Partial<Record<CallListTargetField, string>>;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return { error: "Column mapping is missing or invalid - go back and confirm it again." };
  }
  if (!mapping.business_name) {
    return { error: "Map a column to Business Name before continuing." };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: campaign } = await supabaseAdmin
    .from("leadgen_campaigns")
    .select("id, status, client_id")
    .eq("id", leadgenCampaignId)
    .maybeSingle();
  if (!campaign || !["active", "paused"].includes(campaign.status)) {
    return { error: "Select a valid active or paused campaign for draft preparation." };
  }
  const { data: activeClient } = await supabaseAdmin.from("leadgen_clients").select("id").eq("id", campaign.client_id).eq("active", true).maybeSingle();
  if (!activeClient) return { error: "This campaign's client is inactive." };

  let segmentId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseUploadedFile(file.name, buffer);
    const mappedRows = parsed.rows.map((row) => applyColumnMapping(parsed.headers, row, mapping));

    const segment = await createDraftSegment({
      crm: "lead_generation",
      name,
      campaignName: campaignName || null,
      industry: industry || null,
      territory: territory || null,
      sourceFileName: file.name,
      sourceFileType: parsed.fileType,
      leadgenCampaignId,
      createdBy: admin.id,
    });
    segmentId = segment.id;

    const inserted = await bulkInsertSegmentLeads(segment.id, mappedRows, admin.id);
    await setSegmentTotalUploadedRows(segment.id, inserted);
    await recheckSegmentDuplicates(segment.id, "lead_generation");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import this file.";
    return { error: friendlyTestClientError(message) ?? message };
  }

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}/${segmentId}`);
}

export async function updateSegmentLeadAction(leadId: string, patch: SegmentLeadEditableFields, segmentId: string): Promise<{ error?: string }> {
  await requireLeadgenAdmin();
  try {
    await updateSegmentLeadFields(leadId, patch);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save the change." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

export async function addSegmentLeadAction(segmentId: string, fields: Partial<Record<CallListTargetField, string>>): Promise<{ error?: string }> {
  const admin = await requireLeadgenAdmin();
  try {
    await addManualSegmentLead(segmentId, fields, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add the row." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

export async function removeSegmentLeadsAction(segmentId: string, leadIds: string[]): Promise<{ error?: string }> {
  const admin = await requireLeadgenAdmin();
  try {
    await removeSegmentLeads(leadIds, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove the selected rows." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

export async function restoreSegmentLeadsAction(segmentId: string, leadIds: string[]): Promise<{ error?: string }> {
  await requireLeadgenAdmin();
  try {
    await restoreSegmentLeads(leadIds);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to restore the selected rows." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

export async function recheckDuplicatesAction(segmentId: string): Promise<{ error?: string; possibleDuplicates?: number; dncFlagged?: number }> {
  await requireLeadgenAdmin();
  try {
    const result = await recheckSegmentDuplicates(segmentId, "lead_generation");
    revalidatePath(`${BASE_PATH}/${segmentId}`);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to check for duplicates." };
  }
}

export async function deploySegmentAction(segmentId: string, agentIds: string[], clientId?: string): Promise<{ error?: string }> {
  const admin = await requireLeadgenAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "lead_generation") return { error: "Segment not found." };
  try {
    await deploySegment(segmentId, agentIds, admin.id, clientId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to deploy the segment." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  revalidatePath(BASE_PATH);
  return {};
}

export async function updateSegmentStatusAction(segmentId: string, status: "active" | "completed" | "archived"): Promise<{ error?: string }> {
  await requireLeadgenAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "lead_generation") return { error: "Segment not found." };
  await updateSegmentStatus(segmentId, status);
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  revalidatePath(BASE_PATH);
  return {};
}

export async function deleteDraftSegmentAction(segmentId: string): Promise<{ error?: string } | void> {
  await requireLeadgenAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "lead_generation") return { error: "Segment not found." };
  if (segment.status !== "draft") return { error: "Only a Draft segment can be deleted - archive it instead." };
  await deleteDraftSegment(segmentId);
  revalidatePath(BASE_PATH);
  redirect(BASE_PATH);
}

export async function promoteSegmentLeadAction(leadId: string): Promise<{ error?: string; id?: string; linkedExisting?: boolean }> {
  const admin = await requireLeadgenAdmin();
  const result = await promoteToLeadgenLead(leadId, admin.id);
  if ("error" in result) return { error: result.error };
  return { id: result.id, linkedExisting: result.linkedExisting };
}

// "Update Locations from CSV" (brief's "Existing Imported Lists" section,
// situation B - address data was never imported for this segment).
// Re-parses the same LeadSwift-style file, matches each row to an
// EXISTING call_list_leads row in this segment (by phone, then email,
// then an unambiguous business name), and fills in only whichever of
// street address/city/province/postal code/country is currently blank -
// see src/lib/call-list-backfill.ts for the full non-destructive
// contract. Never creates a call_list_leads row and never touches
// business_name/contact/phone/email/notes/status/assignment/call
// history, on either the staging row or (when a row was already
// promoted) the resulting leadgen_leads record.
export async function backfillSegmentLocationsAction(segmentId: string, formData: FormData): Promise<{ error?: string; summary?: BackfillSummary }> {
  await requireLeadgenAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "lead_generation") return { error: "Segment not found." };

  const file = formData.get("file");
  const mappingRaw = String(formData.get("mapping") ?? "");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or XLSX file to upload." };

  let mapping: Partial<Record<CallListTargetField, string>>;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return { error: "Column mapping is missing or invalid - go back and confirm it again." };
  }
  if (!mapping.business_name && !mapping.phone && !mapping.email) {
    return { error: "Map at least Business Name, Phone, or Email so rows can be matched to existing leads." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseUploadedFile(file.name, buffer);
    const mappedRows = parsed.rows.map((row) => applyColumnMapping(parsed.headers, row, mapping));
    const summary = await backfillSegmentLocationsFromFile(segmentId, "lead_generation", mappedRows);
    revalidatePath(`${BASE_PATH}/${segmentId}`);
    return { summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to process this file." };
  }
}

// "Manage Columns" - display-only, CRM-wide (not per-segment) - never
// touches call_list_leads. Admin-only; requireLeadgenAdmin() is the real
// enforcement, backed by the RLS on call_list_column_visibility (agents
// only ever get a select policy there, never insert/update).
export async function updateCallListColumnVisibilityAction(hiddenFields: string[]): Promise<{ error?: string }> {
  const admin = await requireLeadgenAdmin();
  try {
    await setHiddenColumnFields("lead_generation", hiddenFields, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save column visibility." };
  }
  revalidatePath(BASE_PATH);
  return {};
}

// Admin-only "Save Assignment": the list's client (campaign) + its agent roster
// in one step (also usable to edit, remove or reassign later). Agents must already
// hold the client (client assignment is separate); history is never touched.
export async function saveSegmentAssignmentAction(segmentId: string, campaignId: string, agentIds: string[], clientId?: string): Promise<{ error?: string; added?: number; removed?: number }> {
  const adminUser = await requireLeadgenAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "lead_generation") return { error: "Segment not found." };
  try {
    const result = await saveLeadgenSegmentAssignment(segment, campaignId, agentIds, clientId, adminUser.id);
    revalidatePath(`${BASE_PATH}/${segmentId}`);
    revalidatePath(BASE_PATH);
    revalidatePath("/leadgen/admin/assignments");
    revalidatePath("/leadgen/agent", "layout");
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save the assignment." };
  }
}

// Admin-only: attach or update this list's custom call script. Blank = use the
// client's script. Takes effect immediately for assigned agents; no history is touched.
export async function saveSegmentScriptAction(segmentId: string, _key: string | null, text: string): Promise<{ error?: string }> {
  await requireLeadgenAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "lead_generation") return { error: "Segment not found." };
  try {
    await saveSegmentScript(segment, { key: null, text });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save the script." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  revalidatePath("/leadgen/agent", "layout");
  return {};
}

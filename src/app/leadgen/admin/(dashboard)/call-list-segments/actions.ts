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
import { promoteToLeadgenLead } from "@/lib/call-list-promote";

const BASE_PATH = "/leadgen/admin/call-list-segments";

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
    .select("id, status")
    .eq("id", leadgenCampaignId)
    .maybeSingle();
  if (!campaign || campaign.status !== "active") {
    return { error: "Select a valid, active campaign." };
  }

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
    return { error: err instanceof Error ? err.message : "Failed to import this file." };
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

export async function deploySegmentAction(segmentId: string, agentIds: string[]): Promise<{ error?: string }> {
  const admin = await requireLeadgenAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "lead_generation") return { error: "Segment not found." };
  try {
    await deploySegment(segmentId, agentIds, admin.id);
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

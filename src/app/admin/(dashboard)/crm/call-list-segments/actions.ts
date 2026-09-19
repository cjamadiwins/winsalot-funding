"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { parseUploadedFile } from "@/lib/call-list-file-parser";
import { applyColumnMapping, guessColumnMapping, type CallListTargetField } from "@/lib/call-list-column-mapping";
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
  deleteSegmentLeads,
  recheckSegmentDuplicates,
  updateSegmentLeadFields,
  type SegmentLeadEditableFields,
} from "@/lib/call-list-leads";
import { deploySegment } from "@/lib/call-list-deploy";
import { promoteToGrowthOpportunity } from "@/lib/call-list-promote";

const BASE_PATH = "/admin/crm/call-list-segments";

export async function uploadSegmentAction(formData: FormData): Promise<{ error: string } | void> {
  const admin = await requireCrmAdmin();

  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const campaignName = String(formData.get("campaign_name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const territory = String(formData.get("territory") ?? "").trim();
  const opportunityType = String(formData.get("opportunity_type") ?? "").trim();

  if (!name) return { error: "Segment name is required." };
  if (!["lead_generation", "business_financing", "both_services"].includes(opportunityType)) {
    return { error: "Select which CRM service this segment is for." };
  }
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or XLSX file to upload." };

  let segmentId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseUploadedFile(file.name, buffer);
    const mapping = guessColumnMapping(parsed.headers);
    if (!mapping.business_name) {
      return { error: "Couldn't find a Business Name column in this file - rename the column and re-upload." };
    }
    const mappedRows = parsed.rows.map((row) => applyColumnMapping(parsed.headers, row, mapping as Partial<Record<CallListTargetField, string>>));

    const segment = await createDraftSegment({
      crm: "growth",
      name,
      campaignName: campaignName || null,
      industry: industry || null,
      territory: territory || null,
      sourceFileName: file.name,
      sourceFileType: parsed.fileType,
      growthOpportunityType: opportunityType,
      createdBy: admin.id,
    });
    segmentId = segment.id;

    const inserted = await bulkInsertSegmentLeads(segment.id, mappedRows, admin.id);
    await setSegmentTotalUploadedRows(segment.id, inserted);
    await recheckSegmentDuplicates(segment.id, "growth");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to import this file." };
  }

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}/${segmentId}`);
}

export async function updateSegmentLeadAction(leadId: string, patch: SegmentLeadEditableFields, segmentId: string): Promise<{ error?: string }> {
  await requireCrmAdmin();
  try {
    await updateSegmentLeadFields(leadId, patch);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save the change." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

export async function addSegmentLeadAction(segmentId: string, fields: Partial<Record<CallListTargetField, string>>): Promise<{ error?: string }> {
  const admin = await requireCrmAdmin();
  try {
    await addManualSegmentLead(segmentId, fields, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add the row." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

export async function deleteSegmentLeadsAction(segmentId: string, leadIds: string[]): Promise<{ error?: string }> {
  await requireCrmAdmin();
  try {
    await deleteSegmentLeads(leadIds);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete the selected rows." };
  }
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

export async function recheckDuplicatesAction(segmentId: string): Promise<{ error?: string; possibleDuplicates?: number; dncFlagged?: number }> {
  await requireCrmAdmin();
  try {
    const result = await recheckSegmentDuplicates(segmentId, "growth");
    revalidatePath(`${BASE_PATH}/${segmentId}`);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to check for duplicates." };
  }
}

export async function deploySegmentAction(segmentId: string, agentIds: string[]): Promise<{ error?: string }> {
  const admin = await requireCrmAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "growth") return { error: "Segment not found." };
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
  await requireCrmAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "growth") return { error: "Segment not found." };
  await updateSegmentStatus(segmentId, status);
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  revalidatePath(BASE_PATH);
  return {};
}

export async function deleteDraftSegmentAction(segmentId: string): Promise<{ error?: string } | void> {
  await requireCrmAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "growth") return { error: "Segment not found." };
  if (segment.status !== "draft") return { error: "Only a Draft segment can be deleted - archive it instead." };
  await deleteDraftSegment(segmentId);
  revalidatePath(BASE_PATH);
  redirect(BASE_PATH);
}

export async function promoteSegmentLeadAction(leadId: string): Promise<{ error?: string; id?: string; linkedExisting?: boolean }> {
  const admin = await requireCrmAdmin();
  const result = await promoteToGrowthOpportunity(leadId, admin.id);
  if ("error" in result) return { error: result.error };
  return { id: result.id, linkedExisting: result.linkedExisting };
}

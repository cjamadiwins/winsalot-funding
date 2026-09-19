"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getGoogleConnection } from "@/lib/call-list-connections";
import { getValidAccessToken, fetchSpreadsheetTabs, fetchSheetValues, extractSpreadsheetId } from "@/lib/google-sheets-client";
import { guessColumnMapping, type CallListTargetField } from "@/lib/call-list-column-mapping";
import { createSegment, getSegment, setSegmentAgents, updateSegmentStatus } from "@/lib/call-list-segments";
import { runSegmentSync, type SegmentSyncResult } from "@/lib/call-list-sync";

const BASE_PATH = "/admin/crm/call-list-segments";

export async function loadSheetTabsAction(input: { connectionId: string; sheetUrl: string }) {
  await requireCrmAdmin();
  const spreadsheetId = extractSpreadsheetId(input.sheetUrl);
  if (!spreadsheetId) return { error: "That doesn't look like a Google Sheets link." } as const;

  const connection = await getGoogleConnection(input.connectionId);
  if (!connection || connection.crm !== "growth" || connection.status !== "active") {
    return { error: "That Google connection is no longer available. Reconnect and try again." } as const;
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const { title, tabs } = await fetchSpreadsheetTabs(accessToken, spreadsheetId);
    if (tabs.length === 0) return { error: "This spreadsheet has no sheet tabs." } as const;
    return { spreadsheetId, spreadsheetTitle: title, tabs } as const;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load this spreadsheet." } as const;
  }
}

export async function loadSheetPreviewAction(input: { connectionId: string; spreadsheetId: string; sheetTitle: string }) {
  await requireCrmAdmin();
  const connection = await getGoogleConnection(input.connectionId);
  if (!connection || connection.crm !== "growth" || connection.status !== "active") {
    return { error: "That Google connection is no longer available. Reconnect and try again." } as const;
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const { headers, rows } = await fetchSheetValues(accessToken, input.spreadsheetId, input.sheetTitle);
    if (headers.length === 0) return { error: "This tab's first row has no column headers." } as const;
    return { headers, suggestedMapping: guessColumnMapping(headers), sampleRowCount: rows.length } as const;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read this sheet tab." } as const;
  }
}

// `serviceFieldValue` is the Growth CRM's opportunity_type - named
// generically so the shared NewSegmentClient wizard component can call
// either this or the Lead Generation CRM's createSegmentAction (where the
// same field is a campaign id) with one common shape.
export async function createSegmentAction(input: {
  name: string;
  serviceFieldValue: string;
  agentIds: string[];
  connectionId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTabName: string;
  sheetTabGid: number;
  columnMapping: Partial<Record<CallListTargetField, string>>;
}): Promise<{ error: string } | void> {
  const admin = await requireCrmAdmin();
  if (!input.name.trim()) return { error: "Segment name is required." };
  if (!input.columnMapping.business_name) return { error: "Map at least the Business Name column before connecting." };
  if (!["lead_generation", "business_financing", "both_services"].includes(input.serviceFieldValue)) {
    return { error: "Select which CRM service this segment is for." };
  }

  try {
    await createSegment({
      crm: "growth",
      name: input.name.trim(),
      googleConnectionId: input.connectionId,
      spreadsheetId: input.spreadsheetId,
      spreadsheetUrl: input.spreadsheetUrl,
      sheetTabName: input.sheetTabName,
      sheetTabGid: input.sheetTabGid,
      columnMapping: input.columnMapping,
      growthOpportunityType: input.serviceFieldValue as "lead_generation" | "business_financing" | "both_services",
      createdBy: admin.id,
      agentIds: input.agentIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create the segment.";
    return { error: message.includes("duplicate key") ? "A segment with that name, or for that exact sheet tab, already exists." : message };
  }

  revalidatePath(BASE_PATH);
  redirect(BASE_PATH);
}

export async function syncSegmentNowAction(segmentId: string): Promise<SegmentSyncResult> {
  const admin = await requireCrmAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "growth") throw new Error("Segment not found.");

  const result = await runSegmentSync(segmentId, admin.id);
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  revalidatePath(BASE_PATH);
  return result;
}

export async function updateSegmentAgentsAction(segmentId: string, agentIds: string[]): Promise<{ error?: string }> {
  await requireCrmAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "growth") return { error: "Segment not found." };
  await setSegmentAgents(segmentId, agentIds);
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  return {};
}

// Stops this one segment from syncing - the underlying Google connection
// is left untouched, since other segments may still be reading other
// tabs of the same (or another) spreadsheet through it.
export async function disconnectSegmentAction(segmentId: string): Promise<{ error?: string }> {
  await requireCrmAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "growth") return { error: "Segment not found." };
  await updateSegmentStatus(segmentId, "disconnected");
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  revalidatePath(BASE_PATH);
  return {};
}

export async function reactivateSegmentAction(segmentId: string): Promise<{ error?: string }> {
  await requireCrmAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.crm !== "growth") return { error: "Segment not found." };
  await updateSegmentStatus(segmentId, "active");
  revalidatePath(`${BASE_PATH}/${segmentId}`);
  revalidatePath(BASE_PATH);
  return {};
}

import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CallListCrm } from "./call-list-types";

// Admin-controlled "Hide Columns" for the Call List Segments spreadsheet
// (migration 20260919210000_call_list_column_visibility.sql) - display
// only, never touches call_list_leads itself. One row per CRM. The pure,
// client-safe helpers (KNOWN_COLUMNS, extraFieldColumnKey, isColumnHidden,
// etc.) live in call-list-columns.ts instead of here, since this file is
// server-only (it uses the service-role client) and several call sites
// (SpreadsheetEditorClient, SegmentPerformanceClient, CallListWorkingClient,
// ManageColumnsPopover) are "use client" components.

export async function getHiddenColumnFields(crm: CallListCrm): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("call_list_column_visibility").select("hidden_fields").eq("crm", crm).maybeSingle();
  return (data?.hidden_fields as string[] | null) ?? [];
}

export async function setHiddenColumnFields(crm: CallListCrm, hiddenFields: string[], updatedBy: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("call_list_column_visibility")
    .upsert({ crm, hidden_fields: hiddenFields, updated_at: new Date().toISOString(), updated_by: updatedBy }, { onConflict: "crm" });
  if (error) throw new Error(error.message);
}

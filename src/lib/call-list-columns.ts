// Pure, client-safe helpers for the Call List "Hide Columns" feature - no
// Supabase access, so this is safe to import from both server code and
// "use client" components (SpreadsheetEditorClient, SegmentPerformanceClient,
// CallListWorkingClient, ManageColumnsPopover). The DB-touching half (read/
// write the actual admin setting) lives in call-list-column-visibility.ts,
// which is server-only and re-exports nothing here to avoid ever pulling
// the service-role client into a client bundle.
import { CALL_LIST_TARGET_FIELDS, CALL_LIST_TARGET_FIELD_LABELS } from "./call-list-column-mapping";

// The columns every Call List view (Admin's Draft editor, Admin's
// deployed Segment Performance view, and the Agent's working view)
// already renders somewhere and that are therefore meaningful to hide -
// NOT every column on call_list_leads (assigned_agent_id, promoted_*,
// removed_at, etc. are workflow/status fields, never imported junk, and
// stay permanently visible wherever they already appear).
export const KNOWN_COLUMNS: { key: string; label: string }[] = [
  ...CALL_LIST_TARGET_FIELDS.map((field) => ({ key: field, label: CALL_LIST_TARGET_FIELD_LABELS[field] })),
  { key: "last_outcome", label: "Call Outcome" },
  { key: "callback_at", label: "Callback" },
];

export const EXTRA_FIELD_KEY_PREFIX = "extra:";

export function extraFieldColumnKey(extraFieldName: string): string {
  return `${EXTRA_FIELD_KEY_PREFIX}${extraFieldName}`;
}

export function extraFieldNameFromColumnKey(columnKey: string): string | null {
  return columnKey.startsWith(EXTRA_FIELD_KEY_PREFIX) ? columnKey.slice(EXTRA_FIELD_KEY_PREFIX.length) : null;
}

export function isColumnHidden(hiddenFields: string[], columnKey: string): boolean {
  return hiddenFields.includes(columnKey);
}

// "Reset to Default": the brief's recommended set - every fixed/known
// column visible, every imported extra_fields column hidden. Only ever
// computed against whichever extra_fields keys the caller currently knows
// about (typically the segment being viewed) - re-uploading a segment
// with different extra columns later just means those weren't hidden or
// shown yet, not a conflict with this reset.
export function defaultHiddenColumnFields(extraFieldNames: string[]): string[] {
  return extraFieldNames.map(extraFieldColumnKey);
}

// Client-safe types and pure helpers for the shared Do Not Contact system -
// deliberately NOT `import "server-only"` (unlike dnc-suppression.ts, which
// re-exports everything here) because DncBadge.tsx and
// DoNotContactAdminClient.tsx are client components that need
// `blockedChannelsOf` and these types in the browser bundle. A client
// component importing a value (not just a type) from a `server-only`
// module fails the Next.js build outright - see the "cannot be imported
// from a Client Component module" build error this file fixes.

export type DncChannel = "phone" | "sms" | "email";
export type DncSourceCrm = "lead_generation" | "growth";
export type DncStatus = "active" | "removed";
export type DncAuditAction = "added" | "updated" | "removed" | "reactivated";

export type DncSuppressionRow = {
  id: string;
  contact_name: string | null;
  business_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  email: string | null;
  contact_id: string | null;
  source_crm: DncSourceCrm;
  original_assignment: string | null;
  reason: string;
  notes: string | null;
  added_by_user_id: string | null;
  added_by_name: string | null;
  block_phone: boolean;
  block_sms: boolean;
  block_email: boolean;
  status: DncStatus;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
  removed_by: string | null;
  removed_by_name: string | null;
  removal_reason: string | null;
};

export type DncAuditLogRow = {
  id: string;
  suppression_id: string;
  action: DncAuditAction;
  source_crm: DncSourceCrm;
  performed_by: string | null;
  performed_by_name: string | null;
  reason: string | null;
  notes: string | null;
  channels: { block_phone: boolean; block_sms: boolean; block_email: boolean } | null;
  created_at: string;
};

// Strips everything but digits, then drops a leading NANP "1" trunk code
// (11 digits starting with 1) so "(416) 555-1234", "416-555-1234", and
// "+1 416 555 1234" all normalize to the same 10-digit string - the exact
// "formatting differences must not bypass the list" requirement. Numbers
// that aren't 11-digit-leading-1 (short codes, international numbers) are
// left as their full digit string rather than guessed at.
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

export function normalizeDncEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function blockedChannelsOf(row: Pick<DncSuppressionRow, "block_phone" | "block_sms" | "block_email">): DncChannel[] {
  const channels: DncChannel[] = [];
  if (row.block_phone) channels.push("phone");
  if (row.block_sms) channels.push("sms");
  if (row.block_email) channels.push("email");
  return channels;
}

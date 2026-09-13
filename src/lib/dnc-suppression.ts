import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { parseCsvRows } from "./leadgen-csv";
import {
  blockedChannelsOf,
  normalizeDncEmail,
  normalizePhoneNumber,
  type DncAuditLogRow,
  type DncChannel,
  type DncSourceCrm,
  type DncSuppressionRow,
} from "./dnc-types";

// Shared Do Not Contact / Suppression system (crm_dnc_suppressions,
// crm_dnc_audit_log - migration 0157), checked and written by BOTH the
// Lead Generation CRM and the Growth CRM so a restriction added in either
// one is recognized in the other. Deliberately separate from
// crm-email-suppression.ts (crm_email_suppressions), which stays exactly
// as-is - that table is the Growth CRM's own self-service unsubscribe-link/
// resubscribe-consent system, a different concern from this admin/agent-
// driven, multi-channel, cross-CRM Do Not Contact list. Every write here
// goes through the service-role client; callers are always server actions
// that have already run requireCrmAgent/requireCrmAdmin/requireLeadgenAgent/
// requireLeadgenAdmin, matching the same trust model as crm-email-suppression.ts.
//
// Types and pure helpers (normalizePhoneNumber, blockedChannelsOf, etc.)
// live in ./dnc-types (no `server-only`) and are re-exported below so
// every existing server-side import from this file keeps working - only
// the two client components that need those pure helpers
// (DncBadge.tsx, DoNotContactAdminClient.tsx) import ./dnc-types directly.
export * from "./dnc-types";

// PostgREST's `.or()` filter string treats "," and "(" / ")" as grammar -
// same escaping convention as callLogSearchOrFilter (src/lib/call-log.ts)
// so a search term or email address containing one of those characters
// can't break the filter or be misread as a second condition.
function escapeOrFilterValue(value: string): string {
  return value.replace(/[,()]/g, (ch) => `\\${ch}`);
}

// The single lookup every "is this contact suppressed?" check in both
// CRMs goes through - one active row can be matched by phone OR email,
// since addOrUpdateDncSuppression merges into one row per contact instead
// of creating a second. Returns null when neither identifier is provided
// or nothing active matches.
export async function checkDncSuppression(input: { phone?: string | null; email?: string | null }): Promise<DncSuppressionRow | null> {
  const normalizedPhone = normalizePhoneNumber(input.phone);
  const normalizedEmail = normalizeDncEmail(input.email);
  if (!normalizedPhone && !normalizedEmail) return null;

  const admin = getSupabaseAdmin();
  const orParts: string[] = [];
  if (normalizedPhone) orParts.push(`normalized_phone.eq.${escapeOrFilterValue(normalizedPhone)}`);
  if (normalizedEmail) orParts.push(`email.eq.${escapeOrFilterValue(normalizedEmail)}`);

  const { data } = await admin
    .from("crm_dnc_suppressions")
    .select("*")
    .eq("status", "active")
    .or(orParts.join(","))
    .limit(1)
    .maybeSingle();

  return (data as DncSuppressionRow) ?? null;
}

export async function isPhoneDncBlocked(phone: string | null | undefined, channel: DncChannel = "phone"): Promise<boolean> {
  const row = await checkDncSuppression({ phone });
  if (!row) return false;
  return blockedChannelsOf(row).includes(channel);
}

export async function isEmailDncBlocked(email: string | null | undefined): Promise<boolean> {
  const row = await checkDncSuppression({ email });
  if (!row) return false;
  return row.block_email;
}

// Batch counterpart to checkDncSuppression - one query for an entire list
// view (Item 7: "Anywhere a suppressed prospect/contact appears, display a
// clear red badge") instead of one round trip per row. Returns a lookup
// keyed by each input contact's own `id`, containing only the contacts
// that actually matched an active restriction.
export async function mapDncSuppressionsByContacts(
  contacts: { id: string; phone?: string | null; email?: string | null }[]
): Promise<Record<string, DncSuppressionRow>> {
  const normalizedPhones = new Set<string>();
  const normalizedEmails = new Set<string>();
  for (const contact of contacts) {
    const phone = normalizePhoneNumber(contact.phone);
    const email = normalizeDncEmail(contact.email);
    if (phone) normalizedPhones.add(phone);
    if (email) normalizedEmails.add(email);
  }
  if (normalizedPhones.size === 0 && normalizedEmails.size === 0) return {};

  const admin = getSupabaseAdmin();
  const orParts: string[] = [];
  if (normalizedPhones.size > 0) orParts.push(`normalized_phone.in.(${[...normalizedPhones].join(",")})`);
  if (normalizedEmails.size > 0) orParts.push(`email.in.(${[...normalizedEmails].map(escapeOrFilterValue).join(",")})`);

  const { data } = await admin.from("crm_dnc_suppressions").select("*").eq("status", "active").or(orParts.join(","));
  const rows = (data ?? []) as DncSuppressionRow[];
  const byPhone = new Map(rows.filter((r) => r.normalized_phone).map((r) => [r.normalized_phone as string, r]));
  const byEmail = new Map(rows.filter((r) => r.email).map((r) => [r.email as string, r]));

  const result: Record<string, DncSuppressionRow> = {};
  for (const contact of contacts) {
    const phone = normalizePhoneNumber(contact.phone);
    const email = normalizeDncEmail(contact.email);
    const match = (phone && byPhone.get(phone)) || (email && byEmail.get(email));
    if (match) result[contact.id] = match;
  }
  return result;
}

export type AddDncSuppressionInput = {
  contactName?: string | null;
  businessName?: string | null;
  phone?: string | null;
  email?: string | null;
  contactId?: string | null;
  sourceCrm: DncSourceCrm;
  originalAssignment?: string | null;
  reason: string;
  notes?: string | null;
  addedByUserId: string;
  addedByName: string;
  channels: DncChannel[];
};

export type AddDncSuppressionResult = { row: DncSuppressionRow; created: boolean } | { error: string };

// Agents and admins in both CRMs call this (Item 3: agents may add a
// restriction). If an active restriction already exists for this phone/
// email, its channels are merged (never a second row for the same
// contact - Item 9's "avoid duplicate suppression records"); otherwise a
// new row is created. Every call writes one crm_dnc_audit_log entry.
export async function addOrUpdateDncSuppression(input: AddDncSuppressionInput): Promise<AddDncSuppressionResult> {
  const normalizedPhone = normalizePhoneNumber(input.phone);
  const normalizedEmail = normalizeDncEmail(input.email);
  if (!normalizedPhone && !normalizedEmail) {
    return { error: "A phone number or email address is required to add a Do Not Contact restriction." };
  }
  if (input.channels.length === 0) {
    return { error: "Select at least one channel to suppress (Phone, SMS, or Email)." };
  }
  if (!input.reason.trim()) {
    return { error: "A reason is required." };
  }

  const admin = getSupabaseAdmin();
  const existing = await checkDncSuppression({ phone: input.phone, email: input.email });

  const addedChannels = {
    block_phone: input.channels.includes("phone"),
    block_sms: input.channels.includes("sms"),
    block_email: input.channels.includes("email"),
  };

  if (existing) {
    const merged = {
      block_phone: existing.block_phone || addedChannels.block_phone,
      block_sms: existing.block_sms || addedChannels.block_sms,
      block_email: existing.block_email || addedChannels.block_email,
      contact_name: existing.contact_name || input.contactName || null,
      business_name: existing.business_name || input.businessName || null,
      phone: existing.phone || input.phone || null,
      normalized_phone: existing.normalized_phone || normalizedPhone,
      email: existing.email || normalizedEmail,
      contact_id: existing.contact_id || input.contactId || null,
      notes: [existing.notes, input.notes?.trim()].filter(Boolean).join(" | ") || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin.from("crm_dnc_suppressions").update(merged).eq("id", existing.id).select("*").single();
    if (error || !data) return { error: `Failed to update the existing Do Not Contact restriction: ${error?.message ?? "unknown error"}` };

    await admin.from("crm_dnc_audit_log").insert({
      suppression_id: existing.id,
      action: "updated",
      source_crm: input.sourceCrm,
      performed_by: input.addedByUserId,
      performed_by_name: input.addedByName,
      reason: input.reason.trim(),
      notes: input.notes?.trim() || null,
      channels: { block_phone: merged.block_phone, block_sms: merged.block_sms, block_email: merged.block_email },
    });

    return { row: data as DncSuppressionRow, created: false };
  }

  const { data, error } = await admin
    .from("crm_dnc_suppressions")
    .insert({
      contact_name: input.contactName?.trim() || null,
      business_name: input.businessName?.trim() || null,
      phone: input.phone?.trim() || null,
      normalized_phone: normalizedPhone,
      email: normalizedEmail,
      contact_id: input.contactId || null,
      source_crm: input.sourceCrm,
      original_assignment: input.originalAssignment?.trim() || null,
      reason: input.reason.trim(),
      notes: input.notes?.trim() || null,
      added_by_user_id: input.addedByUserId,
      added_by_name: input.addedByName,
      ...addedChannels,
      status: "active",
    })
    .select("*")
    .single();

  if (error || !data) return { error: `Failed to add the Do Not Contact restriction: ${error?.message ?? "unknown error"}` };

  await admin.from("crm_dnc_audit_log").insert({
    suppression_id: data.id,
    action: "added",
    source_crm: input.sourceCrm,
    performed_by: input.addedByUserId,
    performed_by_name: input.addedByName,
    reason: input.reason.trim(),
    notes: input.notes?.trim() || null,
    channels: addedChannels,
  });

  return { row: data as DncSuppressionRow, created: true };
}

export type RemoveDncSuppressionInput = {
  id: string;
  adminId: string;
  adminName: string;
  sourceCrm: DncSourceCrm;
  removalReason: string;
};

export type DncActionResult = { success: true } | { error: string };

// Admin-only (Item 3: "Agents MUST NOT be able to remove... Only Admin can
// remove/reactivate"). Callers must already have run requireCrmAdmin() /
// requireLeadgenAdmin() - this function itself has no way to check who is
// calling it, exactly like resubscribeEmail() in crm-email-suppression.ts.
// The row is never deleted, only marked removed, so its full history
// (original reason/added-by/date) survives for the audit trail.
export async function removeDncSuppression(input: RemoveDncSuppressionInput): Promise<DncActionResult> {
  if (!input.removalReason.trim()) return { error: "A removal reason is required." };

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("crm_dnc_suppressions").select("status").eq("id", input.id).maybeSingle();
  if (!existing) return { error: "This Do Not Contact record could not be found." };
  if (existing.status !== "active") return { error: "This restriction has already been removed." };

  const { error } = await admin
    .from("crm_dnc_suppressions")
    .update({
      status: "removed",
      removed_at: new Date().toISOString(),
      removed_by: input.adminId,
      removed_by_name: input.adminName,
      removal_reason: input.removalReason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: `Failed to remove the restriction: ${error.message}` };

  await admin.from("crm_dnc_audit_log").insert({
    suppression_id: input.id,
    action: "removed",
    source_crm: input.sourceCrm,
    performed_by: input.adminId,
    performed_by_name: input.adminName,
    reason: input.removalReason.trim(),
    notes: null,
    channels: null,
  });

  return { success: true };
}

export type ReactivateDncSuppressionInput = {
  id: string;
  adminId: string;
  adminName: string;
  sourceCrm: DncSourceCrm;
  reason: string;
};

// Admin-only, mirrors removeDncSuppression - re-suppresses a previously
// removed record without creating a second row for the same contact.
export async function reactivateDncSuppression(input: ReactivateDncSuppressionInput): Promise<DncActionResult> {
  if (!input.reason.trim()) return { error: "A reason is required to reactivate this restriction." };

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("crm_dnc_suppressions").select("status").eq("id", input.id).maybeSingle();
  if (!existing) return { error: "This Do Not Contact record could not be found." };
  if (existing.status !== "removed") return { error: "This restriction is already active." };

  const { error } = await admin
    .from("crm_dnc_suppressions")
    .update({
      status: "active",
      removed_at: null,
      removed_by: null,
      removed_by_name: null,
      removal_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: `Failed to reactivate the restriction: ${error.message}` };

  await admin.from("crm_dnc_audit_log").insert({
    suppression_id: input.id,
    action: "reactivated",
    source_crm: input.sourceCrm,
    performed_by: input.adminId,
    performed_by_name: input.adminName,
    reason: input.reason.trim(),
    notes: null,
    channels: null,
  });

  return { success: true };
}

export type EditDncSuppressionInput = {
  id: string;
  adminId: string;
  adminName: string;
  sourceCrm: DncSourceCrm;
  reason?: string;
  notes?: string;
};

// Admin-only edit of the reason/notes on an existing record (Item 4:
// "Edit reason/notes"). Channels are intentionally not editable here -
// changing what's blocked is functionally the same action as adding or
// removing a restriction, which already have their own audited paths.
export async function editDncSuppressionNotes(input: EditDncSuppressionInput): Promise<DncActionResult> {
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("crm_dnc_suppressions").select("id").eq("id", input.id).maybeSingle();
  if (!existing) return { error: "This Do Not Contact record could not be found." };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.reason !== undefined) updates.reason = input.reason.trim();
  if (input.notes !== undefined) updates.notes = input.notes.trim() || null;

  const { error } = await admin.from("crm_dnc_suppressions").update(updates).eq("id", input.id);
  if (error) return { error: `Failed to save changes: ${error.message}` };

  await admin.from("crm_dnc_audit_log").insert({
    suppression_id: input.id,
    action: "updated",
    source_crm: input.sourceCrm,
    performed_by: input.adminId,
    performed_by_name: input.adminName,
    reason: input.reason?.trim() || null,
    notes: input.notes?.trim() || null,
    channels: null,
  });

  return { success: true };
}

export async function getDncAuditLog(suppressionId: string): Promise<DncAuditLogRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("crm_dnc_audit_log")
    .select("*")
    .eq("suppression_id", suppressionId)
    .order("created_at", { ascending: false });
  return (data ?? []) as DncAuditLogRow[];
}

// Backs the Admin-only Do Not Contact management view (Item 4) in both
// CRMs - loaded once per page render, then searched/filtered/paginated
// client-side (DoNotContactAdminClient), the same convention every other
// admin list table in this app already uses (e.g. LeadsListClient).
// Deliberately shows every row regardless of source_crm - Item 9's
// cross-CRM visibility means a Growth CRM admin must be able to see (and
// manage) a restriction that was added from the Lead Generation CRM, and
// vice versa.
export async function getAllDncSuppressions(): Promise<DncSuppressionRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("crm_dnc_suppressions").select("*").order("created_at", { ascending: false });
  return (data ?? []) as DncSuppressionRow[];
}

// ---------------------------------------------------------------------
// CSV export / import - Item 5: "ADMIN ONLY". Callers (the export route
// and the import server action) are responsible for the requireCrmAdmin()/
// requireLeadgenAdmin() gate; nothing here re-checks role since this
// module has no request/session context of its own.
// ---------------------------------------------------------------------

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildDncCsv(rows: DncSuppressionRow[]): string {
  const header = [
    "Contact Name",
    "Business Name",
    "Phone",
    "Normalized Phone",
    "Email",
    "Source CRM",
    "Original Assignment",
    "Reason",
    "Notes",
    "Added By",
    "Date Added",
    "Blocked Channels",
    "Status",
    "Date Removed",
    "Removed By",
    "Removal Reason",
  ];

  const lines = [
    header,
    ...rows.map((row) => [
      row.contact_name ?? "",
      row.business_name ?? "",
      row.phone ?? "",
      row.normalized_phone ?? "",
      row.email ?? "",
      row.source_crm === "growth" ? "Growth CRM" : "Lead Generation CRM",
      row.original_assignment ?? "",
      row.reason,
      row.notes ?? "",
      row.added_by_name ?? "",
      row.created_at,
      blockedChannelsOf(row).join("; "),
      row.status === "active" ? "Active" : "Removed",
      row.removed_at ?? "",
      row.removed_by_name ?? "",
      row.removal_reason ?? "",
    ]),
  ];

  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
}

export function dncCsvExportFilename(sourceLabel: string, date: Date = new Date()): string {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return `${sourceLabel}_Do_Not_Contact_${key}.csv`;
}

const IMPORT_COLUMN_ALIASES: Record<string, string> = {
  contact_name: "contact_name",
  contact: "contact_name",
  business_name: "business_name",
  business: "business_name",
  company: "business_name",
  phone: "phone",
  phone_number: "phone",
  email: "email",
  email_address: "email",
  reason: "reason",
  notes: "notes",
};

export type ParsedDncCsvRow = {
  contact_name?: string;
  business_name?: string;
  phone?: string;
  email?: string;
  reason?: string;
  notes?: string;
};

// Expected header row: Contact Name, Business Name, Phone, Email, Reason,
// Notes (case-insensitive, common aliases accepted) - the same "Business
// Name" or "Company" style alias set as parseLeadsCsv, for a consistent
// upload experience across every CSV import feature in the app.
export function parseDncCsv(text: string): { rows: ParsedDncCsvRow[]; errors: string[] } {
  const rawRows = parseCsvRows(text);
  const errors: string[] = [];

  if (rawRows.length === 0) return { rows: [], errors: ["The file is empty."] };

  const headerRow = rawRows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const fieldByColumnIndex = headerRow.map((h) => IMPORT_COLUMN_ALIASES[h] ?? null);

  if (!fieldByColumnIndex.includes("phone") && !fieldByColumnIndex.includes("email")) {
    return { rows: [], errors: ['No "Phone" or "Email" column found. At least one is required to identify a contact.'] };
  }

  const rows: ParsedDncCsvRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (raw.every((v) => v.trim() === "")) continue;

    const record: Record<string, string> = {};
    fieldByColumnIndex.forEach((field, colIndex) => {
      if (!field) return;
      const value = (raw[colIndex] ?? "").trim();
      if (value) record[field] = value;
    });

    if (!record.phone && !record.email) {
      errors.push(`Row ${i + 1}: no phone number or email address, skipped.`);
      continue;
    }

    rows.push(record as ParsedDncCsvRow);
  }

  return { rows, errors };
}

export type ImportDncCsvInput = {
  text: string;
  sourceCrm: DncSourceCrm;
  adminId: string;
  adminName: string;
  defaultReason: string;
};

export type ImportDncCsvResult = { added: number; merged: number; skipped: number; errors: string[] };

// Prevents duplicates during import (Item 5): every row is routed through
// addOrUpdateDncSuppression, the same "find the existing active row by
// phone/email and merge, otherwise insert" logic the manual Add form and
// the Do Not Call call outcome already use - an already-suppressed
// contact re-appearing in an uploaded file never becomes a second row.
export async function importDncCsv(input: ImportDncCsvInput): Promise<ImportDncCsvResult> {
  const { rows, errors } = parseDncCsv(input.text);
  let added = 0;
  let merged = 0;

  for (const row of rows) {
    const result = await addOrUpdateDncSuppression({
      contactName: row.contact_name ?? null,
      businessName: row.business_name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      sourceCrm: input.sourceCrm,
      reason: row.reason?.trim() || input.defaultReason,
      notes: row.notes ?? null,
      addedByUserId: input.adminId,
      addedByName: input.adminName,
      channels: ["phone", "sms", "email"],
    });

    if ("error" in result) {
      errors.push(result.error);
      continue;
    }
    if (result.created) added++;
    else merged++;
  }

  return { added, merged, skipped: errors.length, errors };
}

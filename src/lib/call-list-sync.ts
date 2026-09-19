import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getGoogleConnection } from "./call-list-connections";
import { getSegment, getSegmentAgentIds } from "./call-list-segments";
import { getValidAccessToken, fetchSheetValues } from "./google-sheets-client";
import { checkDncSuppression, normalizePhoneNumber } from "./dnc-suppression";
import { CALL_LIST_TARGET_FIELDS, type CallListTargetField } from "./call-list-column-mapping";
import type { CallListSegmentRow, CallListSyncSummary } from "./call-list-types";

// The Google Sheets <-> CRM sync engine shared by both the Growth CRM and
// the Lead Generation CRM. See the migration's header comment for the
// overall design; the short version:
//   * Google Sheets is the source of truth for a fixed set of *contact/
//     list* fields (business name, contact name, phone, email, website,
//     city/province, industry, source notes) - never for anything else.
//   * A sheet row and a CRM row are matched by normalized phone number,
//     falling back to normalized business name when neither row has a
//     phone - there's no synthetic per-row id, since a Google Sheet row
//     has no stable identity of its own (see the migration's note).
//   * A match already tagged with this segment is an update (list fields
//     only, in place). A match found ANYWHERE ELSE in this CRM's table
//     (a different segment, or a lead that predates any segment) is
//     treated as a duplicate and skipped, never merged or re-tagged.
//   * An unmatched sheet row becomes a new lead, checked against the
//     shared Do Not Call list first and skipped if blocked.
//   * A previously-synced lead for this segment that no longer matches
//     any current sheet row is archived (never deleted).

type ParsedRow = Partial<Record<CallListTargetField, string>>;

function normalizeBusinessName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseSheetRow(headers: string[], row: string[], mapping: Partial<Record<CallListTargetField, string>>): ParsedRow {
  const valueByHeader = new Map(headers.map((header, i) => [header, row[i] ?? ""]));
  const parsed: ParsedRow = {};
  for (const field of CALL_LIST_TARGET_FIELDS) {
    const header = mapping[field];
    if (header) parsed[field] = (valueByHeader.get(header) ?? "").trim();
  }
  return parsed;
}

function matchKey(businessName: string | null | undefined, phone: string | null | undefined): string | null {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  const normalizedName = normalizeBusinessName(businessName);
  return normalizedName ? `name:${normalizedName}` : null;
}

type SyncContext = {
  segment: CallListSegmentRow;
  assignedAgentId: string | null;
  createdBy: string;
  leadgenClientId: string | null;
};

type LeadAdapter = {
  table: "crm_opportunities" | "leadgen_leads";
  buildInsert: (row: ParsedRow, ctx: SyncContext) => Record<string, unknown>;
  buildUpdate: (row: ParsedRow) => Record<string, unknown>;
};

const growthAdapter: LeadAdapter = {
  table: "crm_opportunities",
  buildInsert: (row, ctx) => ({
    opportunity_type: ctx.segment.growth_opportunity_type,
    business_name: row.business_name || "Unknown business",
    contact_name: row.contact_name || null,
    phone: row.phone || "",
    email: row.email || null,
    website: row.website || null,
    city: row.city || null,
    province_state: row.province || null,
    industry: row.industry || null,
    source_notes: row.source_notes || null,
    call_list_segment_id: ctx.segment.id,
    assigned_agent_id: ctx.assignedAgentId,
    created_by: ctx.createdBy,
  }),
  buildUpdate: (row) => {
    const update: Record<string, unknown> = {
      contact_name: row.contact_name || null,
      email: row.email || null,
      website: row.website || null,
      city: row.city || null,
      province_state: row.province || null,
      industry: row.industry || null,
      source_notes: row.source_notes || null,
    };
    if (row.business_name) update.business_name = row.business_name;
    if (row.phone) update.phone = row.phone;
    return update;
  },
};

const leadgenAdapter: LeadAdapter = {
  table: "leadgen_leads",
  buildInsert: (row, ctx) => ({
    business_name: row.business_name || "Unknown business",
    contact_name: row.contact_name || null,
    phone: row.phone || null,
    email: row.email || null,
    website: row.website || null,
    city: row.city || null,
    province: row.province || null,
    industry: row.industry || null,
    source_notes: row.source_notes || null,
    client_id: ctx.leadgenClientId,
    campaign_id: ctx.segment.leadgen_campaign_id,
    call_list_segment_id: ctx.segment.id,
    assigned_agent_id: ctx.assignedAgentId,
    created_by: ctx.createdBy,
  }),
  buildUpdate: (row) => {
    const update: Record<string, unknown> = {
      contact_name: row.contact_name || null,
      email: row.email || null,
      website: row.website || null,
      city: row.city || null,
      province: row.province || null,
      industry: row.industry || null,
      source_notes: row.source_notes || null,
    };
    if (row.business_name) update.business_name = row.business_name;
    if (row.phone) update.phone = row.phone;
    return update;
  },
};

export type SegmentSyncResult = CallListSyncSummary & { status: "success" | "partial" | "error" };

export async function runSegmentSync(segmentId: string, triggeredBy: string | null): Promise<SegmentSyncResult> {
  const admin = getSupabaseAdmin();
  const segment = await getSegment(segmentId);
  if (!segment) throw new Error("This Call List Segment no longer exists.");

  const { data: runRow, error: runError } = await admin
    .from("call_list_sync_runs")
    .insert({ segment_id: segmentId, triggered_by: triggeredBy, status: "running" })
    .select("*")
    .single();
  if (runError || !runRow) throw new Error(runError?.message ?? "Could not start the sync run.");

  const summary: CallListSyncSummary = { newLeads: 0, updated: 0, duplicatesSkipped: 0, dncSkipped: 0, archived: 0, errors: [] };

  try {
    const connection = await getGoogleConnection(segment.google_connection_id);
    if (!connection || connection.status !== "active") {
      throw new Error("This segment's Google connection is disconnected or revoked. Reconnect it from the segment page to sync.");
    }

    const adapter = segment.crm === "growth" ? growthAdapter : leadgenAdapter;

    let leadgenClientId: string | null = null;
    if (segment.crm === "lead_generation") {
      if (!segment.leadgen_campaign_id) throw new Error("This segment has no Lead Generation campaign assigned.");
      const { data: campaign } = await admin.from("leadgen_campaigns").select("client_id").eq("id", segment.leadgen_campaign_id).maybeSingle();
      if (!campaign) throw new Error("The campaign linked to this segment no longer exists.");
      leadgenClientId = campaign.client_id as string;
    }

    const accessToken = await getValidAccessToken(connection);
    const { headers, rows } = await fetchSheetValues(accessToken, segment.spreadsheet_id, segment.sheet_tab_name);

    const agentIds = await getSegmentAgentIds(segment.id);
    let roundRobinIndex = 0;

    // One bulk read of the whole table backs both the cross-segment
    // duplicate check and the within-segment archive-sweep diff, instead
    // of a query per row.
    const { data: existingRows } = await admin
      .from(adapter.table)
      .select("id, business_name, phone, call_list_segment_id, archived");

    const globalByPhone = new Map<string, string>();
    const globalByName = new Map<string, string>();
    const segmentByKey = new Map<string, string>();
    for (const existing of existingRows ?? []) {
      const phone = normalizePhoneNumber(existing.phone as string | null);
      const name = normalizeBusinessName(existing.business_name as string | null);
      if (phone && !globalByPhone.has(phone)) globalByPhone.set(phone, existing.id as string);
      if (name && !globalByName.has(name)) globalByName.set(name, existing.id as string);
      if (existing.call_list_segment_id === segment.id && !existing.archived) {
        const key = phone ? `phone:${phone}` : name ? `name:${name}` : null;
        if (key) segmentByKey.set(key, existing.id as string);
      }
    }

    const seenSegmentKeys = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // header occupies row 1
      try {
        const parsed = parseSheetRow(headers, rows[i], segment.column_mapping);
        if (!parsed.business_name && !parsed.phone) continue; // fully blank row

        const key = matchKey(parsed.business_name, parsed.phone);
        if (!key) {
          summary.errors.push({ row: rowNumber, message: "Row has neither a phone number nor a business name - skipped." });
          continue;
        }

        const existingInSegment = segmentByKey.get(key);
        if (existingInSegment) {
          seenSegmentKeys.add(key);
          await admin.from(adapter.table).update(adapter.buildUpdate(parsed)).eq("id", existingInSegment);
          summary.updated++;
          continue;
        }

        const dnc = await checkDncSuppression({ phone: parsed.phone, email: parsed.email });
        if (dnc?.block_phone) {
          summary.dncSkipped++;
          continue;
        }

        const normalizedPhone = normalizePhoneNumber(parsed.phone);
        const normalizedName = normalizeBusinessName(parsed.business_name);
        const isDuplicateElsewhere = normalizedPhone ? globalByPhone.has(normalizedPhone) : normalizedName ? globalByName.has(normalizedName) : false;
        if (isDuplicateElsewhere) {
          summary.duplicatesSkipped++;
          continue;
        }

        const assignedAgentId = agentIds.length > 0 ? agentIds[roundRobinIndex++ % agentIds.length] : null;
        const ctx: SyncContext = { segment, assignedAgentId, createdBy: triggeredBy ?? segment.created_by, leadgenClientId };
        const { data: inserted, error: insertError } = await admin.from(adapter.table).insert(adapter.buildInsert(parsed, ctx)).select("id").single();
        if (insertError || !inserted) {
          summary.errors.push({ row: rowNumber, message: insertError?.message ?? "Insert failed." });
          continue;
        }
        summary.newLeads++;
        // Newly inserted rows also count toward this run's own duplicate
        // detection for any later row that repeats the same contact.
        if (normalizedPhone) globalByPhone.set(normalizedPhone, inserted.id as string);
        if (normalizedName) globalByName.set(normalizedName, inserted.id as string);
      } catch (rowError) {
        summary.errors.push({ row: rowNumber, message: rowError instanceof Error ? rowError.message : "Unknown row error." });
      }
    }

    for (const [key, id] of segmentByKey) {
      if (seenSegmentKeys.has(key)) continue;
      await admin
        .from(adapter.table)
        .update({ archived: true, archived_reason: "Removed from source Google Sheet", archived_at: new Date().toISOString() })
        .eq("id", id);
      summary.archived++;
    }

    const status: "success" | "partial" = summary.errors.length > 0 ? "partial" : "success";
    await admin
      .from("call_list_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        new_leads_count: summary.newLeads,
        updated_count: summary.updated,
        duplicates_skipped_count: summary.duplicatesSkipped,
        dnc_skipped_count: summary.dncSkipped,
        archived_count: summary.archived,
        error_count: summary.errors.length,
        errors: summary.errors,
      })
      .eq("id", runRow.id);

    await admin
      .from("call_list_segments")
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: status, last_sync_summary: summary, status: "active" })
      .eq("id", segment.id);

    return { ...summary, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error.";
    await admin
      .from("call_list_sync_runs")
      .update({ finished_at: new Date().toISOString(), status: "error", error_message: message })
      .eq("id", runRow.id);
    await admin.from("call_list_segments").update({ last_sync_status: "error", status: "error" }).eq("id", segment.id);
    return { ...summary, status: "error", errors: [...summary.errors, { row: 0, message }] };
  }
}

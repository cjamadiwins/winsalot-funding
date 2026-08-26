"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchClientRelatedCounts } from "@/lib/crm-clients-data";
import {
  CLIENT_STATUSES,
  clientHasRelatedRecords,
  describeClientRelatedRecords,
  type ClientStatus,
  type PreArchiveStatus,
} from "@/lib/crm-clients-types";
import type { CrmUserRow } from "@/lib/crm-types";

type ActionResult = { error?: string; clientId?: string };

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

function parseOptionalNumber(raw: FormDataEntryValue | null): number | null {
  const str = String(raw ?? "").trim();
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

function parseOptionalText(raw: FormDataEntryValue | null): string | null {
  const str = String(raw ?? "").trim();
  return str || null;
}

async function logClientActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clientId: string,
  admin: CrmUserRow,
  activityType: string,
  notes: string
) {
  await supabase.from("crm_activities").insert({
    client_id: clientId,
    agent_id: admin.id,
    activity_type: activityType,
    notes,
  });
}

// "Add new client" - admin-only per requireCrmAdmin(). company_name is
// the only field the brief marks as always known; every other field is
// left null/editable ("Leave any unknown details editable for admin
// verification"), same rule the migration's own seed rows follow.
export async function createClientAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { error: "Company name is required." };

  const statusRaw = String(formData.get("status") ?? "Prospect").trim();
  if (!CLIENT_STATUSES.includes(statusRaw as ClientStatus)) return { error: "Invalid status." };

  const { data, error } = await supabase
    .from("crm_clients")
    .insert({
      created_by: admin.id,
      company_name: companyName,
      primary_contact_name: parseOptionalText(formData.get("primary_contact_name")),
      email: parseOptionalText(formData.get("email")),
      phone: parseOptionalText(formData.get("phone")),
      website: parseOptionalText(formData.get("website")),
      billing_address: parseOptionalText(formData.get("billing_address")),
      service: parseOptionalText(formData.get("service")),
      monthly_price: parseOptionalNumber(formData.get("monthly_price")),
      currency: String(formData.get("currency") ?? "USD").trim() || "USD",
      start_date: parseOptionalText(formData.get("start_date")),
      renewal_date: parseOptionalText(formData.get("renewal_date")),
      status: statusRaw as ClientStatus,
      internal_notes: parseOptionalText(formData.get("internal_notes")),
    })
    .select("id")
    .single();

  if (error || !data) return { error: `Failed to create this client: ${error?.message ?? "Unknown error."}` };

  await logClientActivity(supabase, data.id, admin, "client_created", `Client created by ${performedByName(admin)}.`);

  revalidatePath("/admin/crm/clients");
  return { clientId: data.id };
}

// "Edit info" - never touches status directly (archiving/reactivating are
// their own dedicated actions below, since they carry their own
// pre_archive_status bookkeeping and confirmation requirements).
export async function updateClientAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("crm_clients").select("*").eq("id", clientId).maybeSingle();
  if (!existing) return { error: "Client not found." };

  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { error: "Company name is required." };

  const statusRaw = String(formData.get("status") ?? existing.status).trim();
  if (!CLIENT_STATUSES.includes(statusRaw as ClientStatus)) return { error: "Invalid status." };
  if (statusRaw === "Archived" && existing.status !== "Archived") {
    return { error: "Use the Archive action to archive a client, so the prior status is preserved for reactivation." };
  }

  const updates = {
    company_name: companyName,
    primary_contact_name: parseOptionalText(formData.get("primary_contact_name")),
    email: parseOptionalText(formData.get("email")),
    phone: parseOptionalText(formData.get("phone")),
    website: parseOptionalText(formData.get("website")),
    billing_address: parseOptionalText(formData.get("billing_address")),
    service: parseOptionalText(formData.get("service")),
    monthly_price: parseOptionalNumber(formData.get("monthly_price")),
    currency: String(formData.get("currency") ?? "USD").trim() || "USD",
    start_date: parseOptionalText(formData.get("start_date")),
    renewal_date: parseOptionalText(formData.get("renewal_date")),
    status: statusRaw as ClientStatus,
    internal_notes: parseOptionalText(formData.get("internal_notes")),
  };

  const { error } = await supabase.from("crm_clients").update(updates).eq("id", clientId);
  if (error) return { error: `Failed to save changes: ${error.message}` };

  await logClientActivity(supabase, clientId, admin, "client_updated", `Client profile updated by ${performedByName(admin)}.`);

  revalidatePath("/admin/crm/clients");
  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { clientId };
}

// "Archive/deactivate" - preserves every historical appointment, invoice,
// payment, agent assignment, and performance/activity record (nothing is
// deleted or unlinked here - only the client's own status column
// changes), and captures pre_archive_status so Reactivate can restore
// the exact prior status. The confirmation warning itself is shown
// client-side before this is ever called.
export async function archiveClientAction(clientId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("crm_clients").select("*").eq("id", clientId).maybeSingle();
  if (!existing) return { error: "Client not found." };
  if (existing.status === "Archived") return { error: "This client is already archived." };

  const { error } = await supabase
    .from("crm_clients")
    .update({
      status: "Archived",
      pre_archive_status: existing.status as PreArchiveStatus,
      archived_at: new Date().toISOString(),
      archived_by: admin.id,
    })
    .eq("id", clientId);
  if (error) return { error: `Failed to archive this client: ${error.message}` };

  await logClientActivity(supabase, clientId, admin, "client_archived", `Client archived by ${performedByName(admin)} (was ${existing.status}).`);

  revalidatePath("/admin/crm/clients");
  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { clientId };
}

// Restores the exact status a client was archived from.
export async function reactivateClientAction(clientId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("crm_clients").select("*").eq("id", clientId).maybeSingle();
  if (!existing) return { error: "Client not found." };
  if (existing.status !== "Archived") return { error: "This client is not archived." };

  const restoredStatus = (existing.pre_archive_status as PreArchiveStatus) || "Active";
  const { error } = await supabase
    .from("crm_clients")
    .update({ status: restoredStatus, pre_archive_status: null, archived_at: null, archived_by: null })
    .eq("id", clientId);
  if (error) return { error: `Failed to reactivate this client: ${error.message}` };

  await logClientActivity(supabase, clientId, admin, "client_reactivated", `Client reactivated by ${performedByName(admin)} (restored to ${restoredStatus}).`);

  revalidatePath("/admin/crm/clients");
  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { clientId };
}

// "Permanently delete only when zero related appointments/invoices/
// payments/agent-activity/performance records exist" - re-checked here
// on the server regardless of what the confirmation UI already showed,
// since this is exactly the kind of authorization/data-integrity rule
// the brief says must not live only in hidden buttons.
export async function deleteClientAction(clientId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("crm_clients").select("id, company_name").eq("id", clientId).maybeSingle();
  if (!existing) return { error: "Client not found." };

  const counts = await fetchClientRelatedCounts(supabase, clientId);
  if (clientHasRelatedRecords(counts)) {
    return {
      error: `This client has related records (${describeClientRelatedRecords(counts)}) and cannot be permanently deleted. Archive it instead to preserve this history.`,
    };
  }

  // No related records exist yet, so this activity insert is the client's
  // own last row - logged before the delete so it's visible in the admin
  // audit trail generated by this very call, then removed by the cascade
  // delete below along with the client itself (there is nothing else left
  // to preserve, unlike the guarded case above).
  await logClientActivity(supabase, clientId, admin, "client_deleted", `Client "${existing.company_name}" permanently deleted by ${performedByName(admin)}.`);

  const { error } = await supabase.from("crm_clients").delete().eq("id", clientId);
  if (error) return { error: `Failed to delete this client: ${error.message}` };

  revalidatePath("/admin/crm/clients");
  return {};
}

export async function assignAgentAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const agentId = String(formData.get("agent_id") ?? "").trim();
  if (!agentId) return { error: "Select an agent to assign." };

  const { data: agent } = await supabase.from("crm_users").select("full_name, email").eq("id", agentId).maybeSingle();
  if (!agent) return { error: "Agent not found." };

  const { error } = await supabase.from("crm_client_agents").upsert(
    { client_id: clientId, agent_id: agentId, assigned_by: admin.id },
    { onConflict: "client_id,agent_id", ignoreDuplicates: true }
  );
  if (error) return { error: `Failed to assign this agent: ${error.message}` };

  await logClientActivity(
    supabase,
    clientId,
    admin,
    "client_agent_assigned",
    `${agent.full_name || agent.email} assigned to this client by ${performedByName(admin)}.`
  );

  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { clientId };
}

export async function unassignAgentAction(clientId: string, agentId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agent } = await supabase.from("crm_users").select("full_name, email").eq("id", agentId).maybeSingle();

  const { error } = await supabase.from("crm_client_agents").delete().eq("client_id", clientId).eq("agent_id", agentId);
  if (error) return { error: `Failed to unassign this agent: ${error.message}` };

  await logClientActivity(
    supabase,
    clientId,
    admin,
    "client_agent_unassigned",
    `${agent?.full_name || agent?.email || "Agent"} unassigned from this client by ${performedByName(admin)}.`
  );

  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { clientId };
}

// "Appointments delivered" log entry (crm_client_appointments - see
// migration 0091's own comment on why this is separate from
// winsalot_appointments).
export async function recordClientAppointmentAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const appointmentDate = String(formData.get("appointment_date") ?? "").trim();
  if (!appointmentDate) return { error: "An appointment date is required." };
  const agentId = parseOptionalText(formData.get("agent_id"));
  const notes = parseOptionalText(formData.get("notes"));

  const { error } = await supabase.from("crm_client_appointments").insert({
    client_id: clientId,
    agent_id: agentId,
    appointment_date: appointmentDate,
    notes,
    created_by: admin.id,
  });
  if (error) return { error: `Failed to record this appointment: ${error.message}` };

  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { clientId };
}

export async function deleteClientAppointmentAction(clientId: string, appointmentId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_client_appointments").delete().eq("id", appointmentId).eq("client_id", clientId);
  if (error) return { error: `Failed to remove this appointment: ${error.message}` };
  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { clientId };
}

// Records a payment directly against a client with no invoice at all -
// exactly the shape Brent's Essentials' historical $750 needed (brief:
// "Record the existing $750 payment as a historical payment, but do not
// automatically create or send an invoice"). The same form/action also
// works for any future client payment collected outside of a formal
// invoice.
export async function recordStandaloneClientPaymentAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid payment amount greater than zero." };
  const paymentDate = String(formData.get("payment_date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const currency = String(formData.get("currency") ?? "USD").trim() || "USD";
  const paymentMethod = parseOptionalText(formData.get("payment_method"));
  const referenceNumber = parseOptionalText(formData.get("reference_number"));
  const notes = parseOptionalText(formData.get("notes"));

  const { error } = await supabase.from("crm_payments").insert({
    client_id: clientId,
    invoice_id: null,
    payment_date: paymentDate,
    amount,
    currency,
    payment_method: paymentMethod,
    reference_number: referenceNumber,
    notes,
    recorded_by: admin.id,
    recorded_by_name: performedByName(admin),
  });
  if (error) return { error: `Failed to record this payment: ${error.message}` };

  await logClientActivity(
    supabase,
    clientId,
    admin,
    "payment_recorded",
    `Payment of ${currency} ${amount.toFixed(2)} recorded by ${performedByName(admin)} (no invoice).`
  );

  revalidatePath(`/admin/crm/clients/${clientId}`);
  revalidatePath("/admin/crm/invoices");
  return { clientId };
}

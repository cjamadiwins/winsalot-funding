"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  LEADGEN_PAYMENT_MODELS,
  LEADGEN_PAYMENT_STATUSES,
  LEADGEN_MILESTONE_STATUSES,
  type LeadgenPaymentModel,
  type LeadgenPaymentStatus,
  type LeadgenMilestoneStatus,
} from "@/lib/leadgen-types";

type ActionResult = { error?: string };

function parseNumber(value: FormDataEntryValue | null): number | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntOrNull(value: FormDataEntryValue | null): number | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePaymentModel(value: FormDataEntryValue | null): LeadgenPaymentModel {
  const model = String(value ?? "");
  return (LEADGEN_PAYMENT_MODELS as readonly string[]).includes(model) ? (model as LeadgenPaymentModel) : "standard_monthly";
}

function parsePaymentStatus(value: FormDataEntryValue | null): LeadgenPaymentStatus {
  const status = String(value ?? "");
  return (LEADGEN_PAYMENT_STATUSES as readonly string[]).includes(status) ? (status as LeadgenPaymentStatus) : "not_started";
}

function parseMilestoneStatus(value: FormDataEntryValue | null): LeadgenMilestoneStatus {
  const status = String(value ?? "");
  return (LEADGEN_MILESTONE_STATUSES as readonly string[]).includes(status) ? (status as LeadgenMilestoneStatus) : "pending";
}

// "Payment Setup" half of Campaign & Payment Setup (brief sections 7-11,
// 18). Every action here is admin-only both by requireCrmAdmin() and, more
// importantly, at the database level - leadgen_client_payment_configs and
// leadgen_client_payment_milestones have NO client or agent write policy
// at all (migration 20260924212620), so even a bug in this file could
// never let a client mark itself paid; there simply isn't a write path
// for that role to reach.
export async function updateLeadgenPaymentConfigAction(crmClientId: string, leadgenClientId: string, configId: string | null, formData: FormData): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const fields = {
    payment_model: parsePaymentModel(formData.get("payment_model")),
    currency: String(formData.get("currency") ?? "CAD") === "USD" ? "USD" : "CAD",
    total_campaign_fee: parseNumber(formData.get("total_campaign_fee")),
    deposit_required: parseNumber(formData.get("deposit_required")),
    recurring_monthly_amount: parseNumber(formData.get("recurring_monthly_amount")),
    attribution_period_days: parseIntOrNull(formData.get("attribution_period_days")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };

  if (configId) {
    const { error } = await supabaseAdmin.from("leadgen_client_payment_configs").update(fields).eq("id", configId).eq("client_id", leadgenClientId);
    if (error) return { error: `Failed to update payment setup: ${error.message}` };
  } else {
    const { error } = await supabaseAdmin.from("leadgen_client_payment_configs").insert({ ...fields, client_id: leadgenClientId });
    if (error) return { error: `Failed to create payment setup: ${error.message}` };
  }

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "Update amount paid / Update outstanding balance / Payment Status" -
// requirement #10 lists these as admin-only actions distinct from the
// base arrangement fields above, so they get their own small form/action
// rather than being folded into updateLeadgenPaymentConfigAction.
// "Outstanding" itself is never set directly - it's always
// total_campaign_fee - amount_paid (see leadgenPaymentOutstanding()).
export async function updatePaymentProgressAction(crmClientId: string, configId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const amountPaid = parseNumber(formData.get("amount_paid")) ?? 0;
  const paymentStatus = parsePaymentStatus(formData.get("payment_status"));

  const { error } = await supabaseAdmin
    .from("leadgen_client_payment_configs")
    .update({ amount_paid: amountPaid, payment_status: paymentStatus, updated_by: admin.id })
    .eq("id", configId);
  if (error) return { error: `Failed to update payment progress: ${error.message}` };

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "Confirm deposit received" - requirement #10. One-way (received), same
// as the rest of this codebase's activation-style actions (e.g.
// activatePortalAccessAction) - correcting a mistaken confirmation is a
// direct edit via updateLeadgenPaymentConfigAction / a support request,
// not a client-reachable "un-confirm" toggle.
export async function markDepositReceivedAction(crmClientId: string, configId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin
    .from("leadgen_client_payment_configs")
    .update({ deposit_received: true, deposit_received_at: new Date().toISOString(), deposit_received_by: admin.id, updated_by: admin.id })
    .eq("id", configId);
  if (error) return { error: `Failed to confirm deposit received: ${error.message}` };

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// Create-or-update a single milestone row (deposit, staged milestone,
// performance-based trigger, or a custom stage) - not a delete, so
// history (received_at/received_by) survives an edit to the label/amount.
export async function updateLeadgenPaymentMilestoneAction(crmClientId: string, configId: string, milestoneId: string | null, formData: FormData): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Enter a milestone label." };

  const fields = {
    label,
    amount: parseNumber(formData.get("amount")),
    trigger_description: String(formData.get("trigger_description") ?? "").trim() || null,
    auto_trigger_on_nth_won: parseIntOrNull(formData.get("auto_trigger_on_nth_won")),
    status: parseMilestoneStatus(formData.get("status")),
  };

  if (milestoneId) {
    const { error } = await supabaseAdmin.from("leadgen_client_payment_milestones").update(fields).eq("id", milestoneId).eq("payment_config_id", configId);
    if (error) return { error: `Failed to update milestone: ${error.message}` };
  } else {
    const clientIdResult = await supabaseAdmin.from("leadgen_client_payment_configs").select("client_id").eq("id", configId).maybeSingle();
    if (clientIdResult.error || !clientIdResult.data) return { error: "Payment setup not found." };
    const { count } = await supabaseAdmin.from("leadgen_client_payment_milestones").select("id", { count: "exact", head: true }).eq("payment_config_id", configId);

    const { error } = await supabaseAdmin.from("leadgen_client_payment_milestones").insert({
      ...fields,
      payment_config_id: configId,
      client_id: clientIdResult.data.client_id,
      milestone_order: count ?? 0,
    });
    if (error) return { error: `Failed to add milestone: ${error.message}` };
  }

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "Confirm milestone payment received" - requirement #10.
export async function markMilestoneReceivedAction(crmClientId: string, milestoneId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin
    .from("leadgen_client_payment_milestones")
    .update({ status: "received", received_at: new Date().toISOString(), received_by: admin.id })
    .eq("id", milestoneId);
  if (error) return { error: `Failed to confirm milestone received: ${error.message}` };

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

export async function deleteLeadgenPaymentMilestoneAction(crmClientId: string, milestoneId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.from("leadgen_client_payment_milestones").delete().eq("id", milestoneId);
  if (error) return { error: `Failed to remove milestone: ${error.message}` };

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

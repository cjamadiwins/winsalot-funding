"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import {
  AGREEMENT_SERVICE_TYPES,
  AGREEMENT_TARGET_TYPES,
  AGREEMENT_BILLING_FREQUENCIES,
  type AgreementServiceType,
  type AgreementTargetType,
  type AgreementBillingFrequency,
  type CrmAgreementTemplateRow,
  type CrmClientAgreementRow,
} from "@/lib/crm-agreement-types";
import { createAgreementToken } from "@/lib/crm-agreement-tokens";
import { sendAgreementSignEmail } from "@/lib/crm-agreement-emails";

type ActionResult = { error?: string };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

async function logOnboardingActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: { clientId: string; opportunityId?: string | null; admin: CrmUserRow; activityType: string; notes: string }
) {
  await supabase.from("crm_activities").insert({
    client_id: input.clientId,
    opportunity_id: input.opportunityId ?? null,
    agent_id: input.admin.id,
    activity_type: input.activityType,
    notes: input.notes,
  });
}

// Prefers the latest *approved* template (item 3: agreements should use
// legally-reviewed wording once it exists) but falls back to the latest
// draft_pending_review version so the business can still send agreements
// before legal sign-off - the PDF/preview/email all render the same
// "DRAFT - PENDING LEGAL REVIEW" banner in that case (see
// crm-agreement-pdf.tsx), so nobody can mistake it for final wording.
async function getActiveAgreementTemplate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<CrmAgreementTemplateRow | null> {
  const { data } = await supabase
    .from("crm_agreement_templates")
    .select("*")
    .order("legal_status", { ascending: true }) // 'approved' sorts before 'draft_pending_review' alphabetically
    .order("version", { ascending: false });

  if (!data || data.length === 0) return null;
  return data[0] as CrmAgreementTemplateRow;
}

// Item 2: "Allow the admin to start the onboarding workflow from an
// existing Growth CRM opportunity. If no client record exists, allow the
// admin to create a new client during the process. Before creating a new
// client, check the business email address to prevent duplicate client
// records." crm_clients is reused as-is (see migration 0097's header
// comment) - this never creates a new client table, and an existing
// client match is reused rather than duplicated.
export async function startOnboardingFromOpportunityAction(opportunityId: string): Promise<ActionResult & { clientId?: string; agreementId?: string }> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: opportunity, error: oppError } = await supabase
    .from("crm_opportunities")
    .select("business_name, contact_name, email")
    .eq("id", opportunityId)
    .maybeSingle();

  if (oppError || !opportunity) return { error: "Opportunity not found." };
  if (!opportunity.email) return { error: "This opportunity has no email address on file - add one before starting onboarding." };

  const clientId = await resolveOrCreateClient(supabase, admin, {
    companyName: opportunity.business_name,
    contactName: opportunity.contact_name,
    email: opportunity.email,
  });
  if (typeof clientId !== "string") return clientId; // it's an ActionResult error

  const template = await getActiveAgreementTemplate(supabase);
  if (!template) return { error: "No agreement template is configured." };

  const { data: agreement, error: insertError } = await supabase
    .from("crm_client_agreements")
    .insert({
      client_id: clientId,
      opportunity_id: opportunityId,
      template_id: template.id,
      legal_business_name: opportunity.business_name,
      contact_person: opportunity.contact_name || "",
      business_email: opportunity.email,
      service_type: "qualified_leads",
      monthly_target: 1,
      monthly_fee: 0,
      created_by: admin.id,
      updated_by: admin.id,
    })
    .select("id")
    .single();

  if (insertError || !agreement) return { error: "Failed to create the draft agreement." };

  await logOnboardingActivity(supabase, {
    clientId,
    opportunityId,
    admin,
    activityType: "note",
    notes: `Onboarding started by ${performedByName(admin)} - draft agreement created.`,
  });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath("/admin/crm/agreements");
  return { clientId, agreementId: agreement.id as string };
}

// Shared duplicate-email check (item 2) - reused by the opportunity-based
// start flow above and the "create a brand-new client" path a direct
// (non-opportunity) agreement creation can also take.
async function resolveOrCreateClient(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  admin: CrmUserRow,
  input: { companyName: string; contactName: string | null; email: string }
): Promise<string | ActionResult> {
  if (!isValidEmail(input.email)) return { error: "A valid business email is required." };

  const { data: existing } = await supabase.from("crm_clients").select("id").ilike("email", input.email.trim()).maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("crm_clients")
    .insert({
      company_name: input.companyName,
      primary_contact_name: input.contactName,
      email: input.email.trim(),
      status: "Prospect",
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (error || !created) return { error: "Failed to create the client record." };

  await supabase.from("crm_activities").insert({
    client_id: created.id,
    agent_id: admin.id,
    activity_type: "client_created",
    notes: `Client created by ${performedByName(admin)} during onboarding.`,
  });

  return created.id as string;
}

// Direct-create path (item 2's "if no client record exists, allow the
// admin to create a new client during the process") for when onboarding
// isn't started from an opportunity at all - the admin picks an existing
// client or types a brand-new one straight from the "Client Agreements"
// section.
export async function createAgreementForClientAction(
  input: { existingClientId?: string; newClient?: { companyName: string; contactName: string; email: string } }
): Promise<ActionResult & { clientId?: string; agreementId?: string }> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  let clientId: string;
  let legalBusinessName: string;
  let contactPerson: string;
  let businessEmail: string;

  if (input.existingClientId) {
    const { data: client } = await supabase.from("crm_clients").select("company_name, primary_contact_name, email").eq("id", input.existingClientId).maybeSingle();
    if (!client || !client.email) return { error: "Selected client not found or has no email on file." };
    clientId = input.existingClientId;
    legalBusinessName = client.company_name;
    contactPerson = client.primary_contact_name || "";
    businessEmail = client.email;
  } else if (input.newClient) {
    const resolved = await resolveOrCreateClient(supabase, admin, {
      companyName: input.newClient.companyName,
      contactName: input.newClient.contactName,
      email: input.newClient.email,
    });
    if (typeof resolved !== "string") return resolved;
    clientId = resolved;
    legalBusinessName = input.newClient.companyName;
    contactPerson = input.newClient.contactName;
    businessEmail = input.newClient.email;
  } else {
    return { error: "Select an existing client or provide new client details." };
  }

  const template = await getActiveAgreementTemplate(supabase);
  if (!template) return { error: "No agreement template is configured." };

  const { data: agreement, error } = await supabase
    .from("crm_client_agreements")
    .insert({
      client_id: clientId,
      template_id: template.id,
      legal_business_name: legalBusinessName,
      contact_person: contactPerson,
      business_email: businessEmail,
      service_type: "qualified_leads",
      monthly_target: 1,
      monthly_fee: 0,
      created_by: admin.id,
      updated_by: admin.id,
    })
    .select("id")
    .single();

  if (error || !agreement) return { error: "Failed to create the draft agreement." };

  revalidatePath("/admin/crm/onboarding");
  revalidatePath("/admin/crm/agreements");
  return { clientId, agreementId: agreement.id as string };
}

export type AgreementDraftInput = {
  legalBusinessName: string;
  contactPerson: string;
  businessEmail: string;
  serviceType: AgreementServiceType;
  targetType: AgreementTargetType;
  monthlyTarget: number;
  monthlyFee: number;
  setupFee: number | null;
  targetIndustries: string[];
  targetLocations: string[];
  campaignStartDate: string | null;
  billingFrequency: AgreementBillingFrequency;
  paymentDueTerms: string | null;
  initialTerm: string | null;
  renewalTerms: string | null;
  cancellationTerms: string | null;
  additionalNotes: string | null;
};

// Editing a draft (brief section 3/11 "Edit Draft"). Only ever allowed
// while status = 'draft' - the database's own guard trigger backstops
// this for a signed row regardless of what this action checks.
export async function updateAgreementDraftAction(agreementId: string, input: AgreementDraftInput): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("status").eq("id", agreementId).maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status !== "draft") return { error: "Only a draft agreement can be edited. Create a new version instead." };

  if (!AGREEMENT_SERVICE_TYPES.includes(input.serviceType)) return { error: "Invalid service type." };
  if (!AGREEMENT_TARGET_TYPES.includes(input.targetType)) return { error: "Invalid target type." };
  if (!AGREEMENT_BILLING_FREQUENCIES.includes(input.billingFrequency)) return { error: "Invalid billing frequency." };
  if (!isValidEmail(input.businessEmail)) return { error: "A valid business email is required." };
  if (!input.monthlyTarget || input.monthlyTarget <= 0) return { error: "Monthly target must be a positive number." };
  if (input.monthlyFee < 0) return { error: "Monthly fee cannot be negative." };

  const { error } = await supabase
    .from("crm_client_agreements")
    .update({
      legal_business_name: input.legalBusinessName,
      contact_person: input.contactPerson,
      business_email: input.businessEmail,
      service_type: input.serviceType,
      target_type: input.targetType,
      monthly_target: input.monthlyTarget,
      monthly_fee: input.monthlyFee,
      setup_fee: input.setupFee,
      target_industries: input.targetIndustries,
      target_locations: input.targetLocations,
      campaign_start_date: input.campaignStartDate,
      billing_frequency: input.billingFrequency,
      payment_due_terms: input.paymentDueTerms,
      initial_term: input.initialTerm,
      renewal_terms: input.renewalTerms,
      cancellation_terms: input.cancellationTerms,
      additional_notes: input.additionalNotes,
      updated_by: admin.id,
    })
    .eq("id", agreementId);

  if (error) return { error: "Failed to save the draft." };

  revalidatePath(`/admin/crm/agreements/${agreementId}`);
  return {};
}

// Item 4: review-and-send. `reviewedConfirmation` is the required
// checkbox ("I have reviewed the price, monthly target and agreement
// terms.") - the send is refused server-side if it isn't true, not just
// disabled in the UI.
export async function sendAgreementAction(agreementId: string, reviewedConfirmation: boolean): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  if (!reviewedConfirmation) {
    return { error: "You must confirm you have reviewed the price, monthly target and agreement terms before sending." };
  }

  const { data: agreement } = await supabase.from("crm_client_agreements").select("*").eq("id", agreementId).maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status !== "draft") return { error: "Only a draft agreement can be sent." };
  if (!agreement.monthly_fee && agreement.monthly_fee !== 0) return { error: "Monthly fee is required before sending." };

  const { error: updateError } = await supabase
    .from("crm_client_agreements")
    .update({ status: "sent", sent_at: new Date().toISOString(), admin_reviewed_confirmation: true, updated_by: admin.id })
    .eq("id", agreementId);
  if (updateError) return { error: "Failed to update the agreement." };

  const token = await createAgreementToken(agreementId);
  const emailResult = await sendAgreementSignEmail(agreement as CrmClientAgreementRow, token);
  if (emailResult.error) return { error: `Agreement saved, but the email failed to send: ${emailResult.error}` };

  const admin_ = getSupabaseAdmin();
  await admin_.from("crm_agreement_events").insert({ agreement_id: agreementId, event_type: "sent", actor_type: "admin", actor_id: admin.id });

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "agreement_sent",
    notes: `Agreement sent to ${agreement.business_email} by ${performedByName(admin)}.`,
  });

  revalidatePath(`/admin/crm/agreements/${agreementId}`);
  revalidatePath("/admin/crm/onboarding");
  return {};
}

// Resend - never creates a new agreement/token row semantics-wise beyond
// minting a fresh token (the old one simply keeps existing but a client
// following an old email link still works until it expires); the brief's
// "Resend Agreement" + "require confirmation before duplicate-send
// actions" is enforced by the confirm() dialog in the UI before this is
// called.
export async function resendAgreementAction(agreementId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("*").eq("id", agreementId).maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status !== "sent") return { error: "Only a sent (not yet signed) agreement can be resent." };

  const token = await createAgreementToken(agreementId);
  const emailResult = await sendAgreementSignEmail(agreement as CrmClientAgreementRow, token);
  if (emailResult.error) return { error: `Failed to resend: ${emailResult.error}` };

  const admin_ = getSupabaseAdmin();
  await admin_.from("crm_agreement_events").insert({ agreement_id: agreementId, event_type: "resent", actor_type: "admin", actor_id: admin.id });

  revalidatePath(`/admin/crm/agreements/${agreementId}`);
  return {};
}

// Marks the latest draft_pending_review template approved - item 3:
// "Keep this notice until the admin approves the final agreement
// wording." Approving never touches any already-created agreement (each
// snapshots its own template_id), only which template new agreements use
// going forward.
export async function approveAgreementTemplateAction(templateId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_agreement_templates")
    .update({ legal_status: "approved", approved_by: admin.id, approved_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("legal_status", "draft_pending_review");

  if (error) return { error: "Failed to approve the template." };
  revalidatePath("/admin/crm/agreements");
  return {};
}

// Item 10: the lightweight invoice/payment tracker, entirely separate
// from crm_invoices (see migration 0097's header comment). Only
// reachable once the linked agreement is signed AND its intake form has
// a submission - "after the intake form is received."
export async function recordAgreementInvoiceAction(
  agreementId: string,
  input: { invoiceNumber: string; invoiceAmount: number; dateSent: string | null; paymentDueDate: string | null }
): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("id, status, client_id, opportunity_id").eq("id", agreementId).maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status !== "signed") return { error: "The agreement must be signed before recording an invoice." };

  const { data: submission } = await supabase
    .from("crm_intake_submissions")
    .select("id")
    .eq("agreement_id", agreementId)
    .maybeSingle();
  if (!submission) return { error: "The intake form must be received before recording an invoice." };

  if (!input.invoiceNumber.trim()) return { error: "An invoice number is required." };
  if (input.invoiceAmount < 0) return { error: "Invoice amount cannot be negative." };

  const { error } = await supabase.from("crm_agreement_invoices").insert({
    agreement_id: agreementId,
    client_id: agreement.client_id,
    invoice_number: input.invoiceNumber.trim(),
    invoice_amount: input.invoiceAmount,
    date_sent: input.dateSent,
    payment_due_date: input.paymentDueDate,
    status: input.dateSent ? "sent" : "not_sent",
    created_by: admin.id,
    updated_by: admin.id,
  });

  if (error) return { error: "Failed to record the invoice." };

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "onboarding_invoice_recorded",
    notes: `Invoice ${input.invoiceNumber} recorded by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  return {};
}

// Only an admin can update invoice/payment statuses (item 10/12) - this
// is the only path that ever changes crm_agreement_invoices.status.
export async function updateAgreementInvoiceStatusAction(
  invoiceId: string,
  status: "not_sent" | "sent" | "payment_pending" | "payment_received"
): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_agreement_invoices").select("client_id, agreement_id").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };

  const updates: Record<string, unknown> = { status, updated_by: admin.id };
  if (status === "payment_received") updates.paid_at = new Date().toISOString();

  const { error } = await supabase.from("crm_agreement_invoices").update(updates).eq("id", invoiceId);
  if (error) return { error: "Failed to update the invoice status." };

  if (status === "payment_received") {
    await logOnboardingActivity(supabase, {
      clientId: invoice.client_id,
      opportunityId: null,
      admin,
      activityType: "onboarding_payment_received",
      notes: `Payment received recorded by ${performedByName(admin)}.`,
    });
  }

  revalidatePath("/admin/crm/onboarding");
  return {};
}

// Item 10/12: "Do not activate the campaign automatically. Only an admin
// can mark... Campaign Active." Reuses the existing crm_clients.status
// enum (see migration 0097's header comment) rather than a new field -
// this is a normal status transition through a column that already
// exists and is already admin-only per crm_clients' own RLS.
export async function activateCampaignAction(clientId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase
    .from("crm_agreement_invoices")
    .select("status")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invoice || invoice.status !== "payment_received") {
    return { error: "Payment must be received before the campaign can be activated." };
  }

  const { error } = await supabase.from("crm_clients").update({ status: "Active" }).eq("id", clientId);
  if (error) return { error: "Failed to activate the campaign." };

  await logOnboardingActivity(supabase, {
    clientId,
    opportunityId: null,
    admin,
    activityType: "campaign_activated",
    notes: `Campaign activated by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  return {};
}

// Archive - never deletes (item 11: "Do not permanently delete signed
// agreements, invoices, original intake submissions or audit history").
export async function archiveAgreementAction(agreementId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_client_agreements").update({ status: "archived" }).eq("id", agreementId);
  if (error) return { error: "Failed to archive the agreement." };

  const admin_ = getSupabaseAdmin();
  await admin_.from("crm_agreement_events").insert({ agreement_id: agreementId, event_type: "archived", actor_type: "admin" });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath("/admin/crm/agreements");
  return {};
}

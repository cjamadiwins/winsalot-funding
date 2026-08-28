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
  AGREEMENT_CURRENCIES,
  CAMPAIGN_TYPES,
  CLIENT_MANUAL_STATUSES,
  isAgreementLocked,
  type AgreementServiceType,
  type AgreementTargetType,
  type AgreementBillingFrequency,
  type AgreementCurrency,
  type AgreementTemplateKind,
  type CampaignType,
  type ClientManualStatus,
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

// This is a lead-generation service agreement, not a lending agreement -
// no legal-review approval step gates which template is used. Always the
// latest version of the requested kind (standard Client Service
// Agreement vs. Free Pilot Program) - see migration 0098's header
// comment for why pilots use a separate template lineage.
async function getActiveAgreementTemplate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  kind: AgreementTemplateKind
): Promise<CrmAgreementTemplateRow | null> {
  const { data } = await supabase.from("crm_agreement_templates").select("*").eq("kind", kind).order("version", { ascending: false });

  if (!data || data.length === 0) return null;
  return data[0] as CrmAgreementTemplateRow;
}

function templateKindFor(campaignType: CampaignType): AgreementTemplateKind {
  return campaignType === "free_pilot" ? "pilot_program_agreement" : "client_service_agreement";
}

// Item 2: "Allow the admin to start the onboarding workflow from an
// existing Growth CRM opportunity. If no client record exists, allow the
// admin to create a new client during the process. Before creating a new
// client, check the business email address to prevent duplicate client
// records." crm_clients is reused as-is (see migration 0097's header
// comment) - this never creates a new client table, and an existing
// client match is reused rather than duplicated.
export async function startOnboardingFromOpportunityAction(
  opportunityId: string,
  campaignType: CampaignType = "standard_monthly"
): Promise<ActionResult & { clientId?: string; agreementId?: string }> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  if (!CAMPAIGN_TYPES.includes(campaignType)) return { error: "Invalid campaign type." };

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

  const template = await getActiveAgreementTemplate(supabase, templateKindFor(campaignType));
  if (!template) return { error: "No agreement template is configured." };

  // A free pilot is always $0/$0 - forced here at creation time so the
  // fee is never even transiently non-zero, not just hidden by the UI.
  const isPilot = campaignType === "free_pilot";

  const { data: agreement, error: insertError } = await supabase
    .from("crm_client_agreements")
    .insert({
      client_id: clientId,
      opportunity_id: opportunityId,
      template_id: template.id,
      campaign_type: campaignType,
      legal_business_name: opportunity.business_name,
      contact_person: opportunity.contact_name || "",
      business_email: opportunity.email,
      service_type: "qualified_leads",
      monthly_target: 1,
      monthly_fee: 0,
      setup_fee: isPilot ? 0 : null,
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
  input: {
    existingClientId?: string;
    newClient?: { companyName: string; contactName: string; email: string };
    campaignType?: CampaignType;
  }
): Promise<ActionResult & { clientId?: string; agreementId?: string }> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const campaignType = input.campaignType ?? "standard_monthly";
  if (!CAMPAIGN_TYPES.includes(campaignType)) return { error: "Invalid campaign type." };

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

  const template = await getActiveAgreementTemplate(supabase, templateKindFor(campaignType));
  if (!template) return { error: "No agreement template is configured." };

  const isPilot = campaignType === "free_pilot";

  const { data: agreement, error } = await supabase
    .from("crm_client_agreements")
    .insert({
      client_id: clientId,
      template_id: template.id,
      campaign_type: campaignType,
      legal_business_name: legalBusinessName,
      contact_person: contactPerson,
      business_email: businessEmail,
      service_type: "qualified_leads",
      monthly_target: 1,
      monthly_fee: 0,
      setup_fee: isPilot ? 0 : null,
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
  // Free Pilot Program fields - only read/validated when the agreement's
  // own campaign_type is 'free_pilot' (campaign_type itself is set once
  // at creation and never accepted here).
  pilotDuration: string | null;
  pilotEndDate: string | null;
  expectedCallVolume: string | null;
  qualificationCriteria: string | null;
  resultsReviewDate: string | null;
};

// Editing a draft (brief section 3/11 "Edit Draft"). Only ever allowed
// while status = 'draft' - the database's own guard trigger backstops
// this for a signed row regardless of what this action checks.
export async function updateAgreementDraftAction(agreementId: string, input: AgreementDraftInput): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("status, campaign_type").eq("id", agreementId).maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status !== "draft") return { error: "Only a draft agreement can be edited. Create a new version instead." };

  if (!AGREEMENT_SERVICE_TYPES.includes(input.serviceType)) return { error: "Invalid service type." };
  if (!AGREEMENT_TARGET_TYPES.includes(input.targetType)) return { error: "Invalid target type." };
  if (!isValidEmail(input.businessEmail)) return { error: "A valid business email is required." };
  if (!input.monthlyTarget || input.monthlyTarget <= 0) return { error: "Monthly target must be a positive number." };

  const isPilot = agreement.campaign_type === "free_pilot";

  if (isPilot) {
    if (!input.pilotDuration?.trim()) return { error: "Pilot duration is required." };
    if (!input.pilotEndDate) return { error: "Pilot end date is required." };
    if (!input.resultsReviewDate) return { error: "Results-review date is required." };
    if (!input.expectedCallVolume?.trim()) return { error: "Expected call volume or lead-list size is required." };
    if (!input.qualificationCriteria?.trim()) return { error: "Qualification criteria is required." };
    if (input.targetIndustries.length === 0) return { error: "At least one target industry is required." };
    if (input.targetLocations.length === 0) return { error: "At least one target location is required." };
  } else {
    if (!AGREEMENT_BILLING_FREQUENCIES.includes(input.billingFrequency)) return { error: "Invalid billing frequency." };
    if (input.monthlyFee < 0) return { error: "Monthly fee cannot be negative." };
  }

  // A free pilot always shows Pilot Fee: $0 / Setup Fee: $0 - forced
  // server-side regardless of what was submitted, even though the UI
  // never renders fee inputs for a pilot draft.
  const { error } = await supabase
    .from("crm_client_agreements")
    .update({
      legal_business_name: input.legalBusinessName,
      contact_person: input.contactPerson,
      business_email: input.businessEmail,
      service_type: input.serviceType,
      target_type: input.targetType,
      monthly_target: input.monthlyTarget,
      monthly_fee: isPilot ? 0 : input.monthlyFee,
      setup_fee: isPilot ? 0 : input.setupFee,
      target_industries: input.targetIndustries,
      target_locations: input.targetLocations,
      campaign_start_date: input.campaignStartDate,
      billing_frequency: input.billingFrequency,
      payment_due_terms: input.paymentDueTerms,
      initial_term: input.initialTerm,
      renewal_terms: input.renewalTerms,
      cancellation_terms: input.cancellationTerms,
      additional_notes: input.additionalNotes,
      pilot_duration: isPilot ? input.pilotDuration : null,
      pilot_end_date: isPilot ? input.pilotEndDate : null,
      expected_call_volume: isPilot ? input.expectedCallVolume : null,
      qualification_criteria: isPilot ? input.qualificationCriteria : null,
      results_review_date: isPilot ? input.resultsReviewDate : null,
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

  const { data: agreement } = await supabase
    .from("crm_client_agreements")
    .select("id, status, client_id, opportunity_id, campaign_type")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.campaign_type === "free_pilot") return { error: "Free pilot programs do not use invoices." };
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

// ---------------------------------------------------------------------
// Free Pilot Program lifecycle: Pilot Agreed -> Pilot Agreement Signed ->
// Intake Form Sent -> Intake Received -> Admin Activates Pilot -> Pilot
// Active -> Results Review -> Convert to Paid Monthly Campaign / Extend
// Pilot / Close Pilot. Every action here starts with requireCrmAdmin() -
// "Only Growth CRM admins can create, activate, extend, convert or close
// a pilot."
// ---------------------------------------------------------------------

// "Admin Activates Pilot" - only reachable once signed and the intake
// form has been received, mirroring the same precondition the standard
// flow's recordAgreementInvoiceAction already applies. Sets the client to
// the existing (previously unused) crm_clients.status = 'Pilot' value.
export async function activatePilotAction(agreementId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase
    .from("crm_client_agreements")
    .select("id, status, campaign_type, pilot_status, client_id, opportunity_id")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.campaign_type !== "free_pilot") return { error: "Only a Free Pilot Program agreement can be activated." };
  if (agreement.status !== "signed") return { error: "The pilot agreement must be signed before it can be activated." };
  if (agreement.pilot_status !== "not_started") return { error: "This pilot has already been activated." };

  const { data: submission } = await supabase.from("crm_intake_submissions").select("id").eq("agreement_id", agreementId).maybeSingle();
  if (!submission) return { error: "The intake form must be received before the pilot can be activated." };

  const { error } = await supabase.from("crm_client_agreements").update({ pilot_status: "active", updated_by: admin.id }).eq("id", agreementId);
  if (error) return { error: "Failed to activate the pilot." };

  await supabase.from("crm_clients").update({ status: "Pilot" }).eq("id", agreement.client_id);

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "pilot_activated",
    notes: `Pilot activated by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath(`/admin/crm/agreements/${agreementId}`);
  return {};
}

// Moves an active pilot into the results-review gate that unlocks
// Convert / Extend / Close.
export async function startPilotResultsReviewAction(agreementId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase
    .from("crm_client_agreements")
    .select("id, campaign_type, pilot_status, client_id, opportunity_id")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.campaign_type !== "free_pilot") return { error: "Only a Free Pilot Program agreement can enter results review." };
  if (agreement.pilot_status !== "active") return { error: "The pilot must be active before starting results review." };

  const { error } = await supabase.from("crm_client_agreements").update({ pilot_status: "results_review", updated_by: admin.id }).eq("id", agreementId);
  if (error) return { error: "Failed to start results review." };

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "pilot_results_review_started",
    notes: `Results review started by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath(`/admin/crm/agreements/${agreementId}`);
  return {};
}

export type PilotResultsInput = {
  callsCompleted: number | null;
  decisionMakersReached: number | null;
  interestedProspects: number | null;
  informationEmailsSent: number | null;
  qualifiedLeads: number | null;
  appointmentsBooked: number | null;
  commonObjections: string | null;
  marketResponse: string | null;
  adminRecommendation: string | null;
};

// The pilot results dashboard - admin-editable at any point once the
// pilot exists (not gated on a particular pilot_status), since results
// come in progressively during and after the pilot runs. Upserts so the
// admin can keep refining the same record rather than creating
// duplicates.
export async function savePilotResultsAction(agreementId: string, input: PilotResultsInput): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("id, campaign_type, client_id, opportunity_id").eq("id", agreementId).maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.campaign_type !== "free_pilot") return { error: "Pilot results only apply to a Free Pilot Program agreement." };

  const { error } = await supabase.from("crm_pilot_results").upsert(
    {
      agreement_id: agreementId,
      calls_completed: input.callsCompleted,
      decision_makers_reached: input.decisionMakersReached,
      interested_prospects: input.interestedProspects,
      information_emails_sent: input.informationEmailsSent,
      qualified_leads: input.qualifiedLeads,
      appointments_booked: input.appointmentsBooked,
      common_objections: input.commonObjections,
      market_response: input.marketResponse,
      admin_recommendation: input.adminRecommendation,
      updated_by: admin.id,
    },
    { onConflict: "agreement_id" }
  );
  if (error) return { error: "Failed to save the pilot results." };

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "pilot_results_recorded",
    notes: `Pilot results updated by ${performedByName(admin)}.`,
  });

  revalidatePath(`/admin/crm/agreements/${agreementId}`);
  return {};
}

export type ConvertPilotInput = {
  monthlyFee: number;
  setupFee: number | null;
  monthlyTarget: number;
  campaignStartDate: string | null;
  billingFrequency: AgreementBillingFrequency;
  paymentDueTerms: string | null;
};

// "Convert to Paid Monthly Campaign" (brief: "must create a new agreement
// containing the monthly fee, target, start date and billing terms").
// Creates a brand-new draft standard agreement (supersedes_id pointing
// back at the pilot for traceability) that the admin then edits/reviews/
// sends through the *exact* existing pipeline - which already
// auto-creates its own intake config the moment the client signs it (see
// acceptAgreementAction), so nothing else needs to change. The original
// pilot is preserved untouched other than status/pilot_status.
export async function convertPilotToPaidCampaignAction(pilotAgreementId: string, input: ConvertPilotInput): Promise<ActionResult & { agreementId?: string }> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  if (!AGREEMENT_BILLING_FREQUENCIES.includes(input.billingFrequency)) return { error: "Invalid billing frequency." };
  if (!input.monthlyTarget || input.monthlyTarget <= 0) return { error: "Monthly target must be a positive number." };
  if (input.monthlyFee < 0) return { error: "Monthly fee cannot be negative." };

  const { data: pilot } = await supabase.from("crm_client_agreements").select("*").eq("id", pilotAgreementId).maybeSingle();
  if (!pilot) return { error: "Pilot agreement not found." };
  if (pilot.campaign_type !== "free_pilot") return { error: "Only a Free Pilot Program agreement can be converted." };
  if (pilot.pilot_status !== "results_review") return { error: "The pilot must be in results review before it can be converted." };

  const template = await getActiveAgreementTemplate(supabase, "client_service_agreement");
  if (!template) return { error: "No standard agreement template is configured." };

  const { data: newAgreement, error: insertError } = await supabase
    .from("crm_client_agreements")
    .insert({
      client_id: pilot.client_id,
      opportunity_id: pilot.opportunity_id,
      template_id: template.id,
      campaign_type: "standard_monthly",
      supersedes_id: pilotAgreementId,
      version: pilot.version + 1,
      legal_business_name: pilot.legal_business_name,
      contact_person: pilot.contact_person,
      business_email: pilot.business_email,
      service_type: pilot.service_type,
      monthly_target: input.monthlyTarget,
      monthly_fee: input.monthlyFee,
      setup_fee: input.setupFee,
      target_industries: pilot.target_industries,
      target_locations: pilot.target_locations,
      campaign_start_date: input.campaignStartDate,
      billing_frequency: input.billingFrequency,
      payment_due_terms: input.paymentDueTerms,
      created_by: admin.id,
      updated_by: admin.id,
    })
    .select("id")
    .single();
  if (insertError || !newAgreement) return { error: "Failed to create the paid campaign agreement." };

  const { error: updateError } = await supabase
    .from("crm_client_agreements")
    .update({ status: "superseded", pilot_status: "converted", updated_by: admin.id })
    .eq("id", pilotAgreementId);
  if (updateError) return { error: "The new agreement was created, but the pilot could not be marked converted." };

  await logOnboardingActivity(supabase, {
    clientId: pilot.client_id,
    opportunityId: pilot.opportunity_id,
    admin,
    activityType: "pilot_converted",
    notes: `Pilot converted to a paid monthly campaign by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath("/admin/crm/agreements");
  revalidatePath(`/admin/crm/agreements/${pilotAgreementId}`);
  return { agreementId: newAgreement.id as string };
}

export type ExtendPilotInput = {
  newEndDate: string;
  newTarget: number;
};

// "Extend Pilot" (brief: "must create a new pilot agreement or amendment
// with the new end date and target"). Same shape as conversion above, but
// stays a Free Pilot Program agreement - copies every other pilot field
// forward unchanged.
export async function extendPilotAction(pilotAgreementId: string, input: ExtendPilotInput): Promise<ActionResult & { agreementId?: string }> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  if (!input.newTarget || input.newTarget <= 0) return { error: "The new target must be a positive number." };
  if (!input.newEndDate) return { error: "A new end date is required." };

  const { data: pilot } = await supabase.from("crm_client_agreements").select("*").eq("id", pilotAgreementId).maybeSingle();
  if (!pilot) return { error: "Pilot agreement not found." };
  if (pilot.campaign_type !== "free_pilot") return { error: "Only a Free Pilot Program agreement can be extended." };
  if (pilot.pilot_status !== "results_review") return { error: "The pilot must be in results review before it can be extended." };

  const { data: newAgreement, error: insertError } = await supabase
    .from("crm_client_agreements")
    .insert({
      client_id: pilot.client_id,
      opportunity_id: pilot.opportunity_id,
      template_id: pilot.template_id,
      campaign_type: "free_pilot",
      supersedes_id: pilotAgreementId,
      version: pilot.version + 1,
      legal_business_name: pilot.legal_business_name,
      contact_person: pilot.contact_person,
      business_email: pilot.business_email,
      service_type: pilot.service_type,
      monthly_target: input.newTarget,
      monthly_fee: 0,
      setup_fee: 0,
      target_industries: pilot.target_industries,
      target_locations: pilot.target_locations,
      campaign_start_date: pilot.campaign_start_date,
      pilot_duration: pilot.pilot_duration,
      pilot_end_date: input.newEndDate,
      expected_call_volume: pilot.expected_call_volume,
      qualification_criteria: pilot.qualification_criteria,
      results_review_date: pilot.results_review_date,
      created_by: admin.id,
      updated_by: admin.id,
    })
    .select("id")
    .single();
  if (insertError || !newAgreement) return { error: "Failed to create the extended pilot agreement." };

  const { error: updateError } = await supabase
    .from("crm_client_agreements")
    .update({ status: "superseded", pilot_status: "extended", updated_by: admin.id })
    .eq("id", pilotAgreementId);
  if (updateError) return { error: "The new pilot agreement was created, but the original could not be marked extended." };

  await logOnboardingActivity(supabase, {
    clientId: pilot.client_id,
    opportunityId: pilot.opportunity_id,
    admin,
    activityType: "pilot_extended",
    notes: `Pilot extended by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath("/admin/crm/agreements");
  revalidatePath(`/admin/crm/agreements/${pilotAgreementId}`);
  return { agreementId: newAgreement.id as string };
}

// "Close Pilot" - reuses the same archived-status visibility as the
// generic Archive action (never deletes) but is logged distinctly for a
// clearer audit trail, and requires results review first so a pilot
// can't be closed out from under an active engagement by mistake.
export async function closePilotAction(agreementId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase
    .from("crm_client_agreements")
    .select("id, campaign_type, pilot_status, client_id, opportunity_id")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.campaign_type !== "free_pilot") return { error: "Only a Free Pilot Program agreement can be closed." };
  if (agreement.pilot_status !== "results_review") return { error: "The pilot must be in results review before it can be closed." };

  const { error } = await supabase
    .from("crm_client_agreements")
    .update({ status: "archived", pilot_status: "closed", updated_by: admin.id })
    .eq("id", agreementId);
  if (error) return { error: "Failed to close the pilot." };

  const admin_ = getSupabaseAdmin();
  await admin_.from("crm_agreement_events").insert({ agreement_id: agreementId, event_type: "archived", actor_type: "admin" });

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "pilot_closed",
    notes: `Pilot closed by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath("/admin/crm/agreements");
  return {};
}

// ---------------------------------------------------------------------
// The Manage action (migration 0099): a direct Edit/Delete on any
// onboarding record from the dashboard, without walking the full
// agreement lifecycle. Contact info/phone/the manual Client Status
// label/notes are always editable; the record's commercial/legal terms
// (service, program type, pricing/currency, pilot dates/goal) are only
// editable while unsigned - isAgreementLocked() (src/lib/crm-agreement-types.ts)
// is the single source of truth for that boundary, computed here from
// the freshly-fetched row rather than trusted from the client, exactly
// like every other server-side re-check in this file.
// ---------------------------------------------------------------------

export type ManageOnboardingRecordInput = {
  legalBusinessName: string;
  contactPerson: string;
  businessEmail: string;
  phone: string | null;
  manualStatus: ClientManualStatus | null;
  additionalNotes: string | null;
  // Only applied when the record is not locked (see isAgreementLocked).
  serviceType: AgreementServiceType;
  campaignType: CampaignType;
  monthlyTarget: number;
  monthlyFee: number;
  setupFee: number | null;
  currency: AgreementCurrency;
  campaignStartDate: string | null;
  pilotEndDate: string | null;
};

export async function updateOnboardingRecordAction(agreementId: string, input: ManageOnboardingRecordInput): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("*").eq("id", agreementId).maybeSingle();
  if (!agreement) return { error: "Record not found." };

  if (!input.legalBusinessName.trim()) return { error: "Business name is required." };
  if (!input.contactPerson.trim()) return { error: "Contact name is required." };
  if (!isValidEmail(input.businessEmail)) return { error: "A valid email address is required." };
  if (input.manualStatus !== null && !CLIENT_MANUAL_STATUSES.includes(input.manualStatus)) return { error: "Invalid client status." };

  const updates: Record<string, unknown> = {
    legal_business_name: input.legalBusinessName.trim(),
    contact_person: input.contactPerson.trim(),
    business_email: input.businessEmail.trim(),
    phone: input.phone?.trim() || null,
    manual_status: input.manualStatus,
    additional_notes: input.additionalNotes?.trim() || null,
    updated_by: admin.id,
  };

  const locked = isAgreementLocked(agreement as Pick<CrmClientAgreementRow, "accepted_at">);

  if (!locked) {
    if (!AGREEMENT_SERVICE_TYPES.includes(input.serviceType)) return { error: "Invalid service type." };
    if (!CAMPAIGN_TYPES.includes(input.campaignType)) return { error: "Invalid campaign type." };
    if (!AGREEMENT_CURRENCIES.includes(input.currency)) return { error: "Invalid currency." };
    if (!input.monthlyTarget || input.monthlyTarget <= 0) return { error: "Target must be a positive number." };

    const isPilot = input.campaignType === "free_pilot";
    updates.service_type = input.serviceType;
    updates.monthly_target = input.monthlyTarget;
    updates.monthly_fee = isPilot ? 0 : input.monthlyFee;
    updates.setup_fee = isPilot ? 0 : input.setupFee;
    updates.currency = input.currency;
    updates.campaign_start_date = input.campaignStartDate;
    if (isPilot) updates.pilot_end_date = input.pilotEndDate;

    if (input.campaignType !== agreement.campaign_type) {
      const template = await getActiveAgreementTemplate(supabase, templateKindFor(input.campaignType));
      if (!template) return { error: "No agreement template is configured for that program type." };
      updates.campaign_type = input.campaignType;
      updates.template_id = template.id;
    }
  }

  const { error } = await supabase.from("crm_client_agreements").update(updates).eq("id", agreementId);
  if (error) return { error: "Failed to save the record." };

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "onboarding_record_updated",
    notes: `Onboarding record updated by ${performedByName(admin)}.`,
  });

  revalidatePath("/admin/crm/onboarding");
  revalidatePath(`/admin/crm/agreements/${agreementId}`);
  return {};
}

// "Delete" - hard-deletes only a record that was never signed
// (isAgreementLocked false); a signed record carries legally meaningful
// data (the signed PDF, timestamps, intake answers) so it is archived
// instead, exactly like the existing archive action, and the caller is
// told this happened via `archivedInstead` rather than losing anything
// silently.
export async function deleteOnboardingRecordAction(agreementId: string): Promise<ActionResult & { archivedInstead?: boolean }> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase
    .from("crm_client_agreements")
    .select("id, status, accepted_at, client_id, opportunity_id, legal_business_name")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { error: "Record not found." };

  if (isAgreementLocked(agreement as Pick<CrmClientAgreementRow, "accepted_at">)) {
    if (agreement.status === "archived") return { error: "This record has already been archived." };

    const { error } = await supabase.from("crm_client_agreements").update({ status: "archived", updated_by: admin.id }).eq("id", agreementId);
    if (error) return { error: "Failed to archive the record." };

    await logOnboardingActivity(supabase, {
      clientId: agreement.client_id,
      opportunityId: agreement.opportunity_id,
      admin,
      activityType: "onboarding_record_deleted",
      notes: `"${agreement.legal_business_name}" has already been signed and cannot be permanently deleted - archived instead by ${performedByName(admin)}.`,
    });

    revalidatePath("/admin/crm/onboarding");
    revalidatePath("/admin/crm/agreements");
    return { archivedInstead: true };
  }

  await logOnboardingActivity(supabase, {
    clientId: agreement.client_id,
    opportunityId: agreement.opportunity_id,
    admin,
    activityType: "onboarding_record_deleted",
    notes: `Onboarding record "${agreement.legal_business_name}" permanently deleted by ${performedByName(admin)}.`,
  });

  const { error } = await supabase.from("crm_client_agreements").delete().eq("id", agreementId);
  if (error) return { error: `Failed to delete this record: ${error.message}` };

  revalidatePath("/admin/crm/onboarding");
  revalidatePath("/admin/crm/agreements");
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import { resolveClientNotificationRecipient } from "@/lib/leadgen-client-notification";
import {
  PROPOSAL_REQUEST_KEY_PATTERN,
  isProposalStatus,
  nextStatusAfterRequest,
  proposalRequestedActivityNotes,
  proposalStatusChangedActivityNotes,
  validateProposalRequest,
  type LeadProposalRow,
  type ProposalStatus,
} from "@/lib/leadgen-proposal";

// "Request Proposal" (Admin only - requireLeadgenAdmin gates both actions
// server-side regardless of the UI; no agent action exists).
//
// The recipient is ALWAYS resolved here from the lead's own client
// (leadgen_leads.client_id -> leadgen_clients.contact_email); the form only
// carries the subject, body and a one-time send key, so a crafted request can't
// redirect the message to the prospect or anyone else. The send reuses
// sendLeadgenEmail (leadgen_emails row, Resend, webhook delivery tracking).
//
// Order matters: the proposal status and the timeline entry are written only
// AFTER the email was accepted, and the status only ever becomes "Proposal
// Requested" - emailing the client never marks a proposal as sent to the
// prospect. Nothing here touches the lead, its follow-ups, appointments or any
// agent assignment.

export type RequestProposalResult = { emailId: string; error?: string; warning?: string; duplicate?: boolean };
type ActionResult = { error?: string };

export async function requestProposalAction(leadId: string, formData: FormData): Promise<RequestProposalResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const requestKey = String(formData.get("request_key") ?? "").trim();
  const validationError = validateProposalRequest({ subject, body });
  if (validationError) return { emailId: "", error: validationError };
  if (!PROPOSAL_REQUEST_KEY_PATTERN.test(requestKey)) return { emailId: "", error: "This form is out of date. Close it and open Request Proposal again." };

  const { data: lead } = await supabase.from("leadgen_leads").select("id, client_id, campaign_id").eq("id", leadId).maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found." };

  const { data: client } = await supabase
    .from("leadgen_clients")
    .select("id, name, active, contact_name, contact_email")
    .eq("id", lead.client_id)
    .maybeSingle();
  if (!client) return { emailId: "", error: "This lead's client could not be found." };
  if (!client.active) return { emailId: "", error: `${client.name} isn't an active client, so a proposal can't be requested from it.` };

  const resolved = resolveClientNotificationRecipient(client);
  if ("error" in resolved) return { emailId: "", error: resolved.error };
  const { recipient } = resolved;

  const result = await sendLeadgenEmail(supabase, {
    clientId: lead.client_id,
    campaignId: lead.campaign_id,
    leadId,
    templateKey: null,
    toEmail: recipient.email,
    toName: recipient.name,
    subject,
    body,
    sentBy: adminUser.id,
    // Addressed to the client, so it belongs in their Communications view.
    clientVisible: true,
    notificationType: "proposal_requested",
    requestKey,
  });

  // A repeated click / retried request: the first send already happened (or is
  // in flight). Nothing was sent again and nothing is recorded a second time.
  if (result.duplicate) return { emailId: result.emailId, duplicate: true };
  // A failed send keeps its leadgen_emails row (status "failed" + reason) and
  // leaves the proposal status and timeline untouched.
  if (result.error) return { emailId: result.emailId, error: result.error };

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: existing } = await admin.from("leadgen_lead_proposals").select("*").eq("lead_id", leadId).maybeSingle();
  const current = (existing as LeadProposalRow | null) ?? null;
  const nextStatus: ProposalStatus = nextStatusAfterRequest(current?.status);

  const { error: proposalError } = current
    ? await admin
        .from("leadgen_lead_proposals")
        .update({
          status: nextStatus,
          first_requested_at: current.first_requested_at ?? now,
          last_requested_at: now,
          request_count: current.request_count + 1,
          last_request_email_id: result.emailId,
          ...(nextStatus !== current.status ? { status_updated_at: now, status_updated_by: adminUser.id } : {}),
          updated_at: now,
        })
        .eq("lead_id", leadId)
    : await admin.from("leadgen_lead_proposals").insert({
        lead_id: leadId,
        client_id: lead.client_id,
        campaign_id: lead.campaign_id,
        status: nextStatus,
        first_requested_at: now,
        last_requested_at: now,
        request_count: 1,
        last_request_email_id: result.emailId,
        status_updated_at: now,
        status_updated_by: adminUser.id,
      });

  const { error: activityError } = await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "proposal_requested",
    notes: proposalRequestedActivityNotes({
      clientName: client.name,
      toEmail: recipient.email,
      subject,
      sentBy: adminUser.full_name || adminUser.email,
      status: nextStatus,
    }),
  });

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  revalidatePath("/leadgen/admin");
  revalidatePath("/client/proposals");
  if (proposalError || activityError) {
    return {
      emailId: result.emailId,
      warning: `The email was sent to ${client.name} and is saved in the email log, but ${
        proposalError ? "the proposal status" : "its timeline entry"
      } could not be saved. Do not send it again; set the proposal status manually if needed.`,
    };
  }
  return { emailId: result.emailId };
}

// Admin sets the Proposal Status by hand (In Preparation, Proposal Sent,
// Accepted, Declined, ...). Never sends an email and never touches the lead.
export async function updateProposalStatusAction(leadId: string, status: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  if (!isProposalStatus(status)) return { error: "Select a valid proposal status." };

  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase.from("leadgen_leads").select("id, client_id, campaign_id").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found." };

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("leadgen_lead_proposals").select("*").eq("lead_id", leadId).maybeSingle();
  const current = (existing as LeadProposalRow | null) ?? null;
  const previous: ProposalStatus = current?.status ?? "not_requested";
  if (previous === status) return {};

  const now = new Date().toISOString();
  const { error } = current
    ? await admin.from("leadgen_lead_proposals").update({ status, status_updated_at: now, status_updated_by: adminUser.id, updated_at: now }).eq("lead_id", leadId)
    : await admin.from("leadgen_lead_proposals").insert({
        lead_id: leadId,
        client_id: lead.client_id,
        campaign_id: lead.campaign_id,
        status,
        request_count: 0,
        status_updated_at: now,
        status_updated_by: adminUser.id,
      });
  if (error) return { error: "Failed to update the proposal status." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "proposal_status_changed",
    notes: proposalStatusChangedActivityNotes({ from: previous, to: status, changedBy: adminUser.full_name || adminUser.email }),
  });

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  revalidatePath("/leadgen/admin");
  revalidatePath("/client/proposals");
  return {};
}

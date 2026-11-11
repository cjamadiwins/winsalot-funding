"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildLeadgenBookingEmailHtml, sendLeadgenEmail } from "@/lib/leadgen-email";
import { isEmailDncBlocked } from "@/lib/dnc-suppression";
import { fetchQualificationSettings } from "@/lib/leadgen-appointment-qc";
import { isTeknokraftClient, isValidEmail } from "@/lib/leadgen-types";
import { buildProspectProposal, verifiedFactsFromCalls, type ProspectProposalContent } from "@/lib/leadgen-prospect-proposal";
import { renderProspectProposalPdf } from "@/lib/leadgen-prospect-proposal-pdf";

type Result = { error?: string; message?: string };

const last10 = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "").slice(-10);

// Prepare (or refresh) the DRAFT proposal and covering email for a Teknokraft
// lead. Admin only. Nothing is sent: the draft is saved on the lead for review.
// Existing lead data, history and communications are never modified; the only
// additions are the draft itself and one internal timeline note.
export async function prepareProspectProposalAction(leadId: string): Promise<Result> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();

  const { data: lead } = await admin
    .from("leadgen_leads")
    .select("id, client_id, campaign_id, business_name, contact_name, city, province, industry, website, email, phone")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead not found." };

  const { data: client } = await admin.from("leadgen_clients").select("id, name, slug, active, booking_link, services_info_link").eq("id", lead.client_id).maybeSingle();
  if (!client) return { error: "This lead's client could not be found." };
  if (!isTeknokraftClient(client as { slug: string })) return { error: "This proposal can only be prepared for a Teknokraft Canada Inc. lead." };

  const toEmail = String(lead.email ?? "").trim();
  if (!toEmail) return { error: "This lead has no email address on file. Add one before preparing the proposal email." };
  if (!isValidEmail(toEmail)) return { error: "The lead's email address is not valid." };

  const settings = await fetchQualificationSettings(admin, lead.client_id as string);
  const approvedServices = settings?.approved_services ?? [];
  if (approvedServices.length === 0) return { error: "No approved services are configured for this client yet (Admin → Appointment Quality)." };

  // Website: the lead's own field, else the call-list record it came from.
  let website = (lead.website as string | null)?.trim() || null;
  const digits = last10(lead.phone as string | null);
  if (!website) {
    const byPromotion = await admin.from("call_list_leads").select("website").eq("promoted_leadgen_lead_id", leadId).limit(1);
    website = ((byPromotion.data as { website: string | null }[] | null)?.[0]?.website ?? "").trim() || null;
    if (!website && digits.length === 10) {
      const byPhone = await admin.from("call_list_leads").select("website").ilike("phone", `%${digits}`).limit(5);
      website = ((byPhone.data as { website: string | null }[] | null) ?? []).map((r) => (r.website ?? "").trim()).find(Boolean) || null;
    }
  }

  const calls = digits.length === 10 ? ((await admin.from("leadgen_call_logs").select("outcome, notes").ilike("phone", `%${digits}`)).data as { outcome: string | null; notes: string | null }[] | null) ?? [] : [];

  const built = buildProspectProposal({
    lead: { business_name: lead.business_name as string, contact_name: (lead.contact_name as string | null) ?? null, city: (lead.city as string | null) ?? null, province: (lead.province as string | null) ?? null, industry: (lead.industry as string | null) ?? null, website },
    client: { name: client.name as string, booking_link: (client.booking_link as string | null) ?? null, services_info_link: (client.services_info_link as string | null) ?? null },
    approvedServices,
    verifiedFacts: verifiedFactsFromCalls(calls),
    preparedOn: new Date().toISOString().slice(0, 10),
  });

  const now = new Date().toISOString();
  const row = {
    lead_id: leadId,
    client_id: lead.client_id as string,
    campaign_id: (lead.campaign_id as string | null) ?? null,
    title: built.content.title,
    content: built.content,
    email_to: toEmail,
    email_subject: built.emailSubject,
    email_body: built.emailBody,
    attachment_filename: built.filename,
    status: "draft",
    prepared_by: adminUser.id,
    prepared_at: now,
    updated_at: now,
  };
  const { data: existing } = await admin.from("leadgen_prospect_proposals").select("id").eq("lead_id", leadId).eq("status", "draft").maybeSingle();
  const { error } = existing
    ? await admin.from("leadgen_prospect_proposals").update(row).eq("id", (existing as { id: string }).id)
    : await admin.from("leadgen_prospect_proposals").insert(row);
  if (error) return { error: "Failed to save the proposal draft." };

  await admin.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "note",
    notes: `Proposal draft prepared for ${toEmail} by ${adminUser.full_name || adminUser.email} (Admin). Not sent; awaiting Admin review.`,
  });

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return { message: existing ? "Proposal draft refreshed. Nothing was sent." : "Proposal draft prepared. Nothing was sent." };
}

// Send the reviewed draft. Admin only; the recipient is always the address saved
// on the draft and must still match the lead's email; Do Not Contact is checked
// again; the PDF is rendered from the saved content; a request key makes a
// second click a no-op. The lead's status, last-contact date, appointments and
// follow-ups are never touched.
export async function sendProspectProposalAction(leadId: string, proposalId: string): Promise<Result> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const supabase = await createSupabaseServerClient();

  const { data } = await admin.from("leadgen_prospect_proposals").select("*").eq("id", proposalId).eq("lead_id", leadId).maybeSingle();
  const proposal = data as { id: string; client_id: string; campaign_id: string | null; status: string; content: ProspectProposalContent; email_to: string; email_subject: string; email_body: string; attachment_filename: string } | null;
  if (!proposal) return { error: "Proposal not found." };
  if (proposal.status !== "draft") return { error: "This proposal has already been sent." };

  const { data: lead } = await admin.from("leadgen_leads").select("id, email").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found." };
  if (String(lead.email ?? "").trim().toLowerCase() !== proposal.email_to.trim().toLowerCase()) return { error: "The lead's email address changed after this draft was prepared. Refresh the draft, review it, then send." };
  if (!isValidEmail(proposal.email_to)) return { error: "The recipient email address is not valid." };
  if (await isEmailDncBlocked(proposal.email_to)) return { error: "This email address is on the Do Not Contact list and cannot be sent to." };

  const { data: client } = await admin.from("leadgen_clients").select("id, name, active, services_info_link").eq("id", proposal.client_id).maybeSingle();
  if (!client || !(client as { active: boolean }).active) return { error: "This lead's client is not active." };

  const pdf = await renderProspectProposalPdf(proposal.content);
  const bookingUrl = proposal.content.nextStep.bookingUrl;
  const servicesUrl = (client as { services_info_link: string | null }).services_info_link;
  const html = buildLeadgenBookingEmailHtml(proposal.email_body, [
    { url: bookingUrl, label: proposal.content.nextStep.bookingLabel, style: "booking" },
    { url: servicesUrl, label: `Visit ${(client as { name: string }).name}`, style: "button" },
  ]);

  const result = await sendLeadgenEmail(supabase, {
    clientId: proposal.client_id,
    campaignId: proposal.campaign_id,
    leadId,
    templateKey: "teknokraft_proposal",
    toEmail: proposal.email_to,
    subject: proposal.email_subject,
    body: proposal.email_body,
    html,
    sentBy: adminUser.id,
    clientVisible: false,
    attachments: [{ filename: proposal.attachment_filename, content: pdf }],
    requestKey: `prospect-proposal:${proposal.id}`,
  });
  if (result.error) return { error: result.error };

  const now = new Date().toISOString();
  await admin.from("leadgen_prospect_proposals").update({ status: "sent", sent_at: now, sent_by: adminUser.id, sent_email_id: result.emailId || null, updated_at: now }).eq("id", proposal.id);
  await admin.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "note",
    notes: `Proposal emailed to ${proposal.email_to} with PDF attached by ${adminUser.full_name || adminUser.email} (Admin).`,
    occurred_at: now,
  });

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return { message: `Proposal sent to ${proposal.email_to}.` };
}

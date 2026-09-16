import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getSiteUrl } from "./site-url";
import { getResendClient } from "./resend";
import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { notifyAdmins } from "./crm-retention-notifications";
import { buildWinsalotContinueRequestNotification } from "./winsalot-consultation-emails";
import { isValidEmail } from "./winsalot-consultation-types";
import { CLOSED_STAGES, OPPORTUNITY_TYPES, type OpportunityStage, type OpportunityType } from "./crm-types";

// Growth CRM only: backs the public "Continue With Winsalot Corp"
// next-step page (/continue-with-winsalot). A prospect who already had a
// consultation and wants to move forward cannot self-serve into a real
// client record here - crm_clients/crm_client_agreements creation is
// still only ever an admin's own deliberate action (migration 0097/0145)
// - so this is a "collect + notify + confirm" fallback: save the
// request, tell admins, show the prospect a confirmation. It never
// creates a crm_clients or crm_client_agreements row, and never exposes
// any protected client data back to the caller.

const ADMIN_NOTIFICATION_EMAIL = () => process.env.NOTIFICATION_EMAIL || "info@winsalotcorp.com";

export type WinsalotContinueRequestInput = {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  serviceType: OpportunityType;
  notes: string | null;
};

export type WinsalotContinueRequestResult = { error?: string; requestId?: string };

function validateInput(input: WinsalotContinueRequestInput): string | null {
  if (!input.contactName.trim()) return "Enter a contact name.";
  if (!input.businessName.trim()) return "Enter a business name.";
  if (!input.email.trim() || !isValidEmail(input.email)) return "Enter a valid email address.";
  if (!input.phone.trim()) return "Enter a phone number.";
  if (!OPPORTUNITY_TYPES.includes(input.serviceType)) return "Choose a valid service interest.";
  return null;
}

// Deliberately a separate, small reimplementation of performWinsalotBooking's
// own "find or create opportunity by email" matching (winsalot-consultation-
// book.ts) rather than an extracted/shared helper - this keeps that
// already-tested, production-critical booking path completely untouched.
// Same semantics: prefer the newest still-open (non-CLOSED_STAGES) match by
// case-insensitive email, else the newest closed match, else create a new
// "New Prospect" opportunity.
async function findOrCreateOpportunity(
  admin: ReturnType<typeof getSupabaseAdmin>,
  input: WinsalotContinueRequestInput
): Promise<{ opportunityId: string | null }> {
  const { data: matches } = await admin
    .from("crm_opportunities")
    .select("id, stage, created_at")
    .ilike("email", input.email.trim())
    .order("created_at", { ascending: false });

  const openMatch = (matches ?? []).find((m) => !CLOSED_STAGES.includes(m.stage as OpportunityStage));
  const match = openMatch ?? (matches ?? [])[0] ?? null;

  if (match) return { opportunityId: match.id as string };

  const { data: created, error: createError } = await admin
    .from("crm_opportunities")
    .insert({
      opportunity_type: input.serviceType,
      business_name: input.businessName.trim(),
      contact_name: input.contactName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      notes: input.notes,
      stage: "New Prospect",
      created_by: null,
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("[winsalot-continue-request] failed to create prospect record:", createError);
    return { opportunityId: null };
  }
  return { opportunityId: created.id as string };
}

async function sendEmail(to: string, subject: string, text: string, html: string): Promise<{ error?: string }> {
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getEmailSender("growth"),
    to,
    replyTo: getEmailReplyTo(),
    subject,
    text,
    html,
  });
  if (error) return { error: error.message };
  return {};
}

// Claims the request via admin_notified_at before sending anything, so a
// retried Server Action (double-click, a replayed request) can never send
// a second round of admin notifications for the same submission - same
// convention as notifyOfNewWinsalotAppointment.
async function notifyOfWinsalotContinueRequest(
  admin: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  input: WinsalotContinueRequestInput,
  opportunityId: string | null
): Promise<void> {
  const { data: claimed } = await admin
    .from("winsalot_continue_requests")
    .update({ admin_notified_at: new Date().toISOString() })
    .eq("id", requestId)
    .is("admin_notified_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const crmLink = opportunityId ? `${getSiteUrl()}/admin/crm/opportunities/${opportunityId}` : `${getSiteUrl()}/admin/crm/opportunities`;

  const tasks: Promise<unknown>[] = [];

  tasks.push(
    notifyAdmins(admin, {
      title: "Prospect wants to continue with Winsalot Corp",
      body: `${input.contactName} at ${input.businessName} clicked "Continue With Winsalot Corp" and wants to move forward.`,
      linkPath: opportunityId ? `/admin/crm/opportunities/${opportunityId}` : "/admin/crm/opportunities",
    })
  );

  const notification = buildWinsalotContinueRequestNotification({
    contactName: input.contactName.trim(),
    businessName: input.businessName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    serviceType: input.serviceType,
    notes: input.notes,
    crmLink,
  });
  tasks.push(sendEmail(ADMIN_NOTIFICATION_EMAIL(), notification.subject, notification.text, notification.html));

  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected" || (result.status === "fulfilled" && (result.value as { error?: string })?.error)) {
      console.error("[winsalot-continue-request] failed to send a continue-request notification:", result);
    }
  });
}

export async function performWinsalotContinueRequest(input: WinsalotContinueRequestInput): Promise<WinsalotContinueRequestResult> {
  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const admin = getSupabaseAdmin();
  const { opportunityId } = await findOrCreateOpportunity(admin, input);

  const { data: request, error: insertError } = await admin
    .from("winsalot_continue_requests")
    .insert({
      opportunity_id: opportunityId,
      contact_name: input.contactName.trim(),
      business_name: input.businessName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      notes: input.notes,
    })
    .select("id")
    .single();

  if (insertError || !request) {
    console.error("[winsalot-continue-request] failed to save continue request:", insertError);
    return { error: "Failed to save your request. Please try again." };
  }

  if (opportunityId) {
    await admin.from("crm_activities").insert({
      opportunity_id: opportunityId,
      agent_id: null,
      activity_type: "continue_request_submitted",
      notes: `${input.contactName.trim()} clicked "Continue With Winsalot Corp" and wants to move forward.`,
    });
  }

  await notifyOfWinsalotContinueRequest(admin, request.id as string, input, opportunityId);

  return { requestId: request.id as string };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthRedirectBaseUrl } from "@/lib/site-url";
import { buildLeadgenBookingEmailHtml, sendLeadgenEmail } from "@/lib/leadgen-email";
import {
  LEADGEN_BOOKING_BUTTON_LABEL,
  LEADGEN_ROLES,
  leadgenServicesButtonLabel,
  resolveLeadgenEmailBranding,
  slugifyClientName,
  type LeadgenRole,
} from "@/lib/leadgen-types";

type ActionResult = { error?: string };

type CleanupSummary = {
  clientId: string;
  clientName: string;
  deletedEmails: number;
  deletedAppointments: number;
  deletedFollowUps: number;
  deletedActivities: number;
  deletedLeads: number;
  deletedCampaigns: number;
  deletedClientUsers: number;
};

export async function signOutLeadgenAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/leadgen/login");
}

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

// ---------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------
export async function createClientAction(formData: FormData): Promise<ActionResult & { clientId?: string }> {
  const admin = await requireLeadgenAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  let slug = String(formData.get("slug") ?? "").trim() || slugifyClientName(name);
  slug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return { error: "Could not generate a URL slug from this name - please set one manually." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_clients")
    .insert({
      name,
      slug,
      contact_name: textOrNull(formData, "contact_name"),
      contact_email: textOrNull(formData, "contact_email"),
      contact_phone: textOrNull(formData, "contact_phone"),
      booking_link: textOrNull(formData, "booking_link"),
      services_info_link: textOrNull(formData, "services_info_link"),
      calendly_event_type_uri: textOrNull(formData, "calendly_event_type_uri"),
      notes: textOrNull(formData, "notes"),
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: `The slug "${slug}" is already in use by another client.` };
    return { error: "Failed to create the client." };
  }

  revalidatePath("/leadgen/admin/clients");
  return { clientId: data.id as string };
}

export async function updateClientAction(clientId: string, formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  let slug = String(formData.get("slug") ?? "").trim();
  slug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return { error: "A URL slug is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("leadgen_clients")
    .update({
      name,
      slug,
      contact_name: textOrNull(formData, "contact_name"),
      contact_email: textOrNull(formData, "contact_email"),
      contact_phone: textOrNull(formData, "contact_phone"),
      booking_link: textOrNull(formData, "booking_link"),
      services_info_link: textOrNull(formData, "services_info_link"),
      calendly_event_type_uri: textOrNull(formData, "calendly_event_type_uri"),
      notes: textOrNull(formData, "notes"),
      active: formData.get("active") !== "false",
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);

  if (error) {
    if (error.code === "23505") return { error: `The slug "${slug}" is already in use by another client.` };
    return { error: "Failed to update the client." };
  }

  revalidatePath(`/leadgen/admin/clients/${clientId}`);
  revalidatePath("/leadgen/admin/clients");
  return {};
}

// ---------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------
export async function createCampaignAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Campaign name is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_campaigns").insert({
    client_id: clientId,
    name,
    description: textOrNull(formData, "description"),
    booking_link: textOrNull(formData, "booking_link"),
    start_date: textOrNull(formData, "start_date"),
    end_date: textOrNull(formData, "end_date"),
    created_by: admin.id,
  });

  if (error) return { error: "Failed to create the campaign." };

  revalidatePath(`/leadgen/admin/clients/${clientId}`);
  return {};
}

export async function updateCampaignAction(campaignId: string, formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Campaign name is required." };
  const status = String(formData.get("status") ?? "active");
  if (!["active", "paused", "completed"].includes(status)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("leadgen_campaigns")
    .update({
      name,
      description: textOrNull(formData, "description"),
      booking_link: textOrNull(formData, "booking_link"),
      start_date: textOrNull(formData, "start_date"),
      end_date: textOrNull(formData, "end_date"),
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (error) return { error: "Failed to update the campaign." };

  revalidatePath(`/leadgen/admin/campaigns/${campaignId}`);
  return {};
}

// ---------------------------------------------------------------------
// Users (admin / agent / client logins) - same invite-only pattern as
// the cleaning CRM's crm/agents/actions.ts: admin supplies name + email
// (+ role, + client for a client login), Supabase emails the invite
// link, the recipient sets their own password at /leadgen/set-password.
// ---------------------------------------------------------------------
export async function inviteLeadgenUserAction(formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const clientId = textOrNull(formData, "client_id");

  if (!fullName || !email) return { error: "Name and email are required." };
  if (!LEADGEN_ROLES.includes(role as LeadgenRole)) return { error: "Invalid role." };
  if (role === "client" && !clientId) return { error: "Select which client this login belongs to." };
  if (role !== "client" && clientId) return { error: "Only a client-role login can be tied to a client." };

  const admin = getSupabaseAdmin();
  const { data: authUser, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAuthRedirectBaseUrl()}/leadgen/set-password`,
    data: { full_name: fullName },
  });

  if (authError || !authUser.user) {
    return { error: authError?.message ?? "Failed to invite this user." };
  }

  const { error: insertError } = await admin.from("leadgen_users").insert({
    id: authUser.user.id,
    full_name: fullName,
    email,
    role,
    client_id: role === "client" ? clientId : null,
    active: true,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: "Failed to save the user record." };
  }

  revalidatePath("/leadgen/admin/agents");
  return {};
}

export async function updateLeadgenUserAction(userId: string, formData: FormData): Promise<ActionResult> {
  const currentAdmin = await requireLeadgenAdmin();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!fullName) return { error: "Name is required." };
  if (userId === currentAdmin.id && !active) return { error: "You can't deactivate your own account." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_users").update({ full_name: fullName, active }).eq("id", userId);

  if (error) return { error: "Failed to update this user." };

  revalidatePath("/leadgen/admin/agents");
  return {};
}

export async function removeLeadgenUserAction(userId: string): Promise<ActionResult> {
  const currentAdmin = await requireLeadgenAdmin();
  if (userId === currentAdmin.id) return { error: "You can't remove your own account." };

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: "Failed to remove this user." };

  revalidatePath("/leadgen/admin/agents");
  return {};
}

// ---------------------------------------------------------------------
// Resend a failed email - creates a fresh leadgen_emails row (a new send
// attempt) rather than mutating the failed one, so the original failure
// stays in the audit trail exactly as it happened. Generic: works for a
// failed client communication or a failed prospect/consultation email
// alike, since both live in the same table.
// ---------------------------------------------------------------------
export async function resendLeadgenEmailAction(emailId: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: original } = await supabase.from("leadgen_emails").select("*").eq("id", emailId).maybeSingle();
  if (!original) return { error: "Email not found." };
  if (original.status !== "failed" && original.status !== "bounced") {
    return { error: "Only a failed or bounced email can be resent." };
  }

  // Preserve the original plain-text body while restoring the consultation
  // buttons into the HTML channel for resend attempts.
  let html: string | undefined;
  if (original.template_key === "consultation_invitation" || original.template_key === "consultation_follow_up") {
    const { data: clientRow } = await supabase
      .from("leadgen_clients")
      .select("name, slug, booking_link, services_info_link")
      .eq("id", original.client_id)
      .maybeSingle();

    if (clientRow) {
      const branding = resolveLeadgenEmailBranding(clientRow, clientRow.booking_link, clientRow.services_info_link);
      html = buildLeadgenBookingEmailHtml(original.body, [
        { url: branding.bookingUrl, label: LEADGEN_BOOKING_BUTTON_LABEL, style: "booking" },
        { url: branding.servicesUrl, label: leadgenServicesButtonLabel(branding.clientName) },
      ]);
    }
  }

  const result = await sendLeadgenEmail(supabase, {
    clientId: original.client_id,
    campaignId: original.campaign_id,
    leadId: original.lead_id,
    appointmentId: original.appointment_id,
    templateKey: original.template_key,
    toEmail: original.to_email,
    toName: original.to_name,
    subject: original.subject,
    body: original.body,
    html,
    sentBy: adminUser.id,
    clientVisible: original.client_visible,
  });

  if (result.error) return { error: result.error };

  revalidatePath("/leadgen/admin/clients");
  if (original.lead_id) revalidatePath(`/leadgen/admin/leads/${original.lead_id}`);
  return {};
}

// ---------------------------------------------------------------------
// Clears a permanently-bounced address so it can be emailed again -
// brief: "Prevent agents from repeatedly emailing a permanently bounced
// address unless an admin corrects or approves the email address."
// Approving in place (the address itself was fine, e.g. a transient
// mailbox-full bounce) and "correcting" it (editing the lead's email to
// a different address, then never touching this one again) both end up
// here: sendLeadgenEmail() (lib/leadgen-email.ts) only blocks a send
// while an uncleared row exists for that exact address.
// ---------------------------------------------------------------------
export async function clearBouncedEmailAction(email: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("leadgen_bounced_emails")
    .update({ cleared_at: new Date().toISOString(), cleared_by: adminUser.id })
    .eq("email", email.trim().toLowerCase());

  if (error) return { error: "Failed to clear this address." };

  revalidatePath("/leadgen/admin/leads");
  revalidatePath("/leadgen/admin/clients");
  return {};
}

// ---------------------------------------------------------------------
// One-time data cleanup: remove test clients and their test-linked data.
// This is intentionally strict and only targets the requested names.
// ---------------------------------------------------------------------
export async function cleanupLeadgenTestClientsAction(): Promise<ActionResult & { summaries?: CleanupSummary[] }> {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const targetNames = ["Chijioke Amadi", "Winsalot Corp."];

  const { data: targetClients, error: clientLookupError } = await supabase
    .from("leadgen_clients")
    .select("id, name")
    .in("name", targetNames);

  if (clientLookupError) return { error: "Failed to load target clients." };
  if (!targetClients || targetClients.length === 0) return { error: "No matching test clients found." };

  const brentsClient = targetClients.find((c) => c.name === "Brent's Essentials");
  if (brentsClient) return { error: "Safety stop: refusing to delete Brent's Essentials." };

  const summaries: CleanupSummary[] = [];

  for (const client of targetClients) {
    const { data: leadRows, error: leadReadError } = await supabase.from("leadgen_leads").select("id").eq("client_id", client.id);
    if (leadReadError) return { error: `Failed to read leads for ${client.name}.` };

    const leadIds = (leadRows ?? []).map((r) => r.id as string);

    const { data: emailsDeleted, error: emailsDeleteError } = await supabase
      .from("leadgen_emails")
      .delete()
      .eq("client_id", client.id)
      .select("id");
    if (emailsDeleteError) return { error: `Failed to delete emails for ${client.name}.` };

    const { data: apptsDeleted, error: apptsDeleteError } = await supabase
      .from("leadgen_appointments")
      .delete()
      .eq("client_id", client.id)
      .select("id");
    if (apptsDeleteError) return { error: `Failed to delete appointments for ${client.name}.` };

    let followUpsDeletedCount = 0;
    let activitiesDeletedCount = 0;
    if (leadIds.length > 0) {
      const { data: followUpsDeleted, error: followUpsDeleteError } = await supabase
        .from("leadgen_followups")
        .delete()
        .in("lead_id", leadIds)
        .select("id");
      if (followUpsDeleteError) return { error: `Failed to delete follow-ups for ${client.name}.` };
      followUpsDeletedCount = (followUpsDeleted ?? []).length;

      const { data: activitiesDeleted, error: activitiesDeleteError } = await supabase
        .from("leadgen_lead_activities")
        .delete()
        .in("lead_id", leadIds)
        .select("id");
      if (activitiesDeleteError) return { error: `Failed to delete lead activities for ${client.name}.` };
      activitiesDeletedCount = (activitiesDeleted ?? []).length;
    }

    const { data: leadsDeleted, error: leadsDeleteError } = await supabase
      .from("leadgen_leads")
      .delete()
      .eq("client_id", client.id)
      .select("id");
    if (leadsDeleteError) return { error: `Failed to delete leads for ${client.name}.` };

    const { data: campaignsDeleted, error: campaignsDeleteError } = await supabase
      .from("leadgen_campaigns")
      .delete()
      .eq("client_id", client.id)
      .select("id");
    if (campaignsDeleteError) return { error: `Failed to delete campaigns for ${client.name}.` };

    const { data: clientUsersDeleted, error: clientUsersDeleteError } = await supabase
      .from("leadgen_users")
      .delete()
      .eq("client_id", client.id)
      .select("id");
    if (clientUsersDeleteError) return { error: `Failed to delete client users for ${client.name}.` };

    const { error: clientDeleteError } = await supabase.from("leadgen_clients").delete().eq("id", client.id);
    if (clientDeleteError) return { error: `Failed to delete client ${client.name}.` };

    summaries.push({
      clientId: client.id,
      clientName: client.name,
      deletedEmails: (emailsDeleted ?? []).length,
      deletedAppointments: (apptsDeleted ?? []).length,
      deletedFollowUps: followUpsDeletedCount,
      deletedActivities: activitiesDeletedCount,
      deletedLeads: (leadsDeleted ?? []).length,
      deletedCampaigns: (campaignsDeleted ?? []).length,
      deletedClientUsers: (clientUsersDeleted ?? []).length,
    });
  }

  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/admin/clients");
  revalidatePath("/leadgen/admin/leads");
  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/admin/emails");

  return { summaries };
}

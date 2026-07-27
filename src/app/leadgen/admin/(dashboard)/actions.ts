"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthRedirectBaseUrl } from "@/lib/site-url";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import { slugifyClientName, LEADGEN_ROLES, type LeadgenRole } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

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
    sentBy: adminUser.id,
    clientVisible: original.client_visible,
  });

  if (result.error) return { error: result.error };

  revalidatePath("/leadgen/admin/clients");
  if (original.lead_id) revalidatePath(`/leadgen/admin/leads/${original.lead_id}`);
  return {};
}

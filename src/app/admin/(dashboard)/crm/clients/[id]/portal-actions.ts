"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidEmail, slugifyClientName } from "@/lib/leadgen-types";
import { fetchLeadgenClientById, fetchPortalUsersForLeadgenClient } from "@/lib/client-portal-data";
import { sendPortalEmail } from "@/lib/client-portal-emails";
import type { CrmClientPortalActivityAction } from "@/lib/client-portal-shared";
import type { CrmUserRow } from "@/lib/crm-types";

type ActionResult = { error?: string };
type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

async function logPortalActivity(
  supabase: SupabaseServerClient,
  crmClientId: string,
  admin: CrmUserRow,
  action: CrmClientPortalActivityAction,
  detail?: string
) {
  await supabase.from("crm_client_portal_activity").insert({
    client_id: crmClientId,
    action,
    performed_by: admin.id,
    performed_by_name: performedByName(admin),
    detail: detail ?? null,
  });
}

async function loadCrmClientLink(supabase: SupabaseServerClient, crmClientId: string) {
  const { data } = await supabase.from("crm_clients").select("id, company_name, leadgen_client_id").eq("id", crmClientId).maybeSingle();
  return data;
}

// Links this Growth CRM client to an existing, not-yet-linked Lead
// Generation CRM client - step 1 of the brief's "New Client Workflow"
// ("The client is linked to the correct Lead Generation CRM campaign").
export async function linkLeadgenClientAction(crmClientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const leadgenClientId = String(formData.get("leadgen_client_id") ?? "").trim();
  if (!leadgenClientId) return { error: "Select a Lead Generation client to link." };

  const leadgenClient = await fetchLeadgenClientById(leadgenClientId);
  if (!leadgenClient) return { error: "Lead Generation client not found." };

  const { error } = await supabase.from("crm_clients").update({ leadgen_client_id: leadgenClientId }).eq("id", crmClientId);
  if (error) {
    if (error.message.toLowerCase().includes("unique")) {
      return { error: "That Lead Generation client is already linked to a different Growth CRM client." };
    }
    return { error: `Failed to link this client: ${error.message}` };
  }

  await logPortalActivity(supabase, crmClientId, admin, "leadgen_client_linked", `Linked to Lead Generation client "${leadgenClient.name}".`);

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// Creates a brand-new Lead Generation CRM client (and its unique slug) and
// links it in one step, for a client that doesn't have one yet.
export async function createAndLinkLeadgenClientAction(crmClientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name for the new Lead Generation client." };

  const supabaseAdmin = getSupabaseAdmin();
  const baseSlug = slugifyClientName(name) || "client";
  let slug = baseSlug;
  for (let attempt = 2; attempt <= 50; attempt++) {
    const { data: existing } = await supabaseAdmin.from("leadgen_clients").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${attempt}`;
  }

  const { data: created, error } = await supabaseAdmin
    .from("leadgen_clients")
    .insert({ name, slug, active: true, created_by: admin.id })
    .select("id, name")
    .single();
  if (error || !created) return { error: `Failed to create the Lead Generation client: ${error?.message ?? "Unknown error."}` };

  const { error: linkError } = await supabase.from("crm_clients").update({ leadgen_client_id: created.id }).eq("id", crmClientId);
  if (linkError) return { error: `Created the Lead Generation client, but failed to link it: ${linkError.message}` };

  await logPortalActivity(supabase, crmClientId, admin, "leadgen_client_linked", `Created and linked new Lead Generation client "${created.name}".`);

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "CREATE PORTAL ACCESS": creates the auth user and leadgen_users login
// silently (admin.auth.admin.createUser sends no email, unlike
// inviteUserByEmail) with active=false - the brief is explicit that
// creating access must never itself grant it or notify the client; that
// only happens via the separate Activate/Send Portal Invite actions.
export async function createPortalAccessAction(crmClientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const crmClient = await loadCrmClientLink(supabase, crmClientId);
  if (!crmClient) return { error: "Client not found." };
  if (!crmClient.leadgen_client_id) return { error: "Link this client to a Lead Generation CRM client first." };

  const existingPortalUsers = await fetchPortalUsersForLeadgenClient(crmClient.leadgen_client_id);
  if (existingPortalUsers.length >= 2) return { error: "This client already has the maximum of two portal login accounts." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || crmClient.company_name;
  if (!email || !isValidEmail(email)) return { error: "Enter a valid client login email." };

  const supabaseAdmin = getSupabaseAdmin();
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    const message = (createError?.message ?? "").toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return { error: "A login already exists for this email. Use a different email for the client's portal login." };
    }
    return { error: createError?.message ?? "Failed to create the portal login." };
  }

  const { error: insertError } = await supabaseAdmin.from("leadgen_users").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    role: "client",
    client_id: crmClient.leadgen_client_id,
    active: false,
  });

  if (insertError) {
    // Roll back the orphaned auth user rather than leave a login that no
    // leadgen_users row backs (requireLeadgenUser would treat it as "not
    // set up for the Lead Generation CRM" forever).
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return { error: "Failed to save the portal login record." };
  }

  await logPortalActivity(supabase, crmClientId, admin, "portal_created", `Portal login created for ${email}.`);

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "ACTIVATE PORTAL ACCESS" - only ever the client's *first* activation
// (activated_at is still null). A previously-activated-then-disabled
// login uses reactivatePortalAccessAction instead, so the two show up as
// distinct, correctly-labeled history entries even though the underlying
// column update is identical.
export async function activatePortalAccessAction(crmClientId: string, portalUserId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const crmClient = await loadCrmClientLink(supabase, crmClientId);
  if (!crmClient?.leadgen_client_id) return { error: "Client not found or not linked to a Lead Generation client." };

  const portalUser = (await fetchPortalUsersForLeadgenClient(crmClient.leadgen_client_id)).find((user) => user.id === portalUserId);
  if (!portalUser) return { error: "Create portal access first." };
  if (portalUser.active) return { error: "Portal access is already active." };
  if (portalUser.activated_at) return { error: "This portal was previously active - use Reactivate Portal Access instead." };

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("leadgen_users")
    .update({ active: true, activated_at: new Date().toISOString(), activated_by: admin.id })
    .eq("id", portalUser.id);
  if (error) return { error: "Failed to activate portal access." };

  await logPortalActivity(supabase, crmClientId, admin, "portal_activated");

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "DISABLE PORTAL ACCESS" - immediately blocks login (requireLeadgenUser
// re-checks the `active` flag on every request and signs the client out
// the moment it's false, even mid-session) without touching any lead,
// appointment, campaign, or client record.
export async function disablePortalAccessAction(crmClientId: string, portalUserId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const crmClient = await loadCrmClientLink(supabase, crmClientId);
  if (!crmClient?.leadgen_client_id) return { error: "Client not found or not linked to a Lead Generation client." };

  const portalUser = (await fetchPortalUsersForLeadgenClient(crmClient.leadgen_client_id)).find((user) => user.id === portalUserId);
  if (!portalUser) return { error: "Portal access has not been created for this client." };
  if (!portalUser.active) return { error: "Portal access is already disabled." };

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("leadgen_users")
    .update({ active: false, deactivated_at: new Date().toISOString(), deactivated_by: admin.id })
    .eq("id", portalUser.id);
  if (error) return { error: "Failed to disable portal access." };

  await logPortalActivity(supabase, crmClientId, admin, "portal_disabled");

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "REACTIVATE PORTAL ACCESS" - restores access without creating a new
// account or losing any portal history (same leadgen_users row, same id,
// same email - only `active` and the activated_at/by bookkeeping change).
export async function reactivatePortalAccessAction(crmClientId: string, portalUserId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const crmClient = await loadCrmClientLink(supabase, crmClientId);
  if (!crmClient?.leadgen_client_id) return { error: "Client not found or not linked to a Lead Generation client." };

  const portalUser = (await fetchPortalUsersForLeadgenClient(crmClient.leadgen_client_id)).find((user) => user.id === portalUserId);
  if (!portalUser) return { error: "Create portal access first." };
  if (portalUser.active) return { error: "Portal access is already active." };
  if (!portalUser.activated_at) return { error: "This portal has never been activated - use Activate Portal Access instead." };

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("leadgen_users")
    .update({ active: true, activated_at: new Date().toISOString(), activated_by: admin.id })
    .eq("id", portalUser.id);
  if (error) return { error: "Failed to reactivate portal access." };

  await logPortalActivity(supabase, crmClientId, admin, "portal_reactivated");

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "SEND PORTAL INVITE" / "RESEND PORTAL INVITE" - one action, since the
// only difference is the activity log wording and the invited_at
// bookkeeping; the email itself is safe to send any number of times (a
// fresh single-use link is generated on every call).
export async function sendPortalInviteAction(crmClientId: string, portalUserId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const crmClient = await loadCrmClientLink(supabase, crmClientId);
  if (!crmClient?.leadgen_client_id) return { error: "Client not found or not linked to a Lead Generation client." };

  const portalUser = (await fetchPortalUsersForLeadgenClient(crmClient.leadgen_client_id)).find((user) => user.id === portalUserId);
  if (!portalUser) return { error: "Create portal access first." };

  const isResend = Boolean(portalUser.invited_at);
  const sendResult = await sendPortalEmail({
    kind: "invite",
    leadgenClientId: crmClient.leadgen_client_id,
    clientName: crmClient.company_name,
    toEmail: portalUser.email,
    toName: portalUser.full_name,
  });
  if (sendResult.error) return { error: sendResult.error };

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.from("leadgen_users").update({ invited_at: new Date().toISOString(), invited_by: admin.id }).eq("id", portalUser.id);

  await logPortalActivity(supabase, crmClientId, admin, isResend ? "invite_resent" : "invite_sent", `Sent to ${portalUser.email}.`);

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

// "RESET CLIENT ACCESS" - a secure Supabase recovery link, emailed the
// same way as the invite. No plain-text password is ever generated or
// shown in the CRM.
export async function resetClientAccessAction(crmClientId: string, portalUserId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const crmClient = await loadCrmClientLink(supabase, crmClientId);
  if (!crmClient?.leadgen_client_id) return { error: "Client not found or not linked to a Lead Generation client." };

  const portalUser = (await fetchPortalUsersForLeadgenClient(crmClient.leadgen_client_id)).find((user) => user.id === portalUserId);
  if (!portalUser) return { error: "Create portal access first." };

  const sendResult = await sendPortalEmail({
    kind: "reset",
    leadgenClientId: crmClient.leadgen_client_id,
    clientName: crmClient.company_name,
    toEmail: portalUser.email,
    toName: portalUser.full_name,
  });
  if (sendResult.error) return { error: sendResult.error };

  await logPortalActivity(supabase, crmClientId, admin, "access_reset", `Sent to ${portalUser.email}.`);

  revalidatePath(`/admin/crm/clients/${crmClientId}`);
  return {};
}

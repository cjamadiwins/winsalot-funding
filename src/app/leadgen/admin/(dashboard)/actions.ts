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

type ActionResult = {
  error?: string;
  errorId?: string;
  step?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type SupabaseErrorLike = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  serialized?: unknown;
};

const UUID_V4_OR_V1_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_V4_OR_V1_REGEX.test(value.trim());
}

function redactSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("token") || lower.includes("secret") || lower.includes("password") || lower.includes("cookie") || lower.includes("authorization") || lower.endsWith("key");
}

function safeSerializeUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[Function]";

  if (Array.isArray(value)) {
    return value.map((item) => safeSerializeUnknown(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (redactSensitiveKey(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = safeSerializeUnknown(entry, seen);
    }
    return out;
  }

  try {
    return String(value);
  } catch {
    return "[Unserializable]";
  }
}

function toSupabaseErrorLike(error: unknown): SupabaseErrorLike {
  const raw = (error ?? null) as Record<string, unknown> | null;

  return {
    name: typeof raw?.name === "string" ? raw.name : undefined,
    message: typeof raw?.message === "string" ? raw.message : undefined,
    code: typeof raw?.code === "string" ? raw.code : undefined,
    details: typeof raw?.details === "string" ? raw.details : undefined,
    hint: typeof raw?.hint === "string" ? raw.hint : undefined,
    status: typeof raw?.status === "number" ? raw.status : undefined,
    serialized: safeSerializeUnknown(error),
  };
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function projectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const ref = hostname.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

function projectRefFromServiceRoleKey(serviceRoleKey: string): string | null {
  try {
    const parts = serviceRoleKey.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { iss?: string };
    if (!payload.iss) return null;
    return projectRefFromSupabaseUrl(payload.iss);
  } catch {
    return null;
  }
}

function isRetryableAuthError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.status !== undefined && error.status >= 500) return true;
  const text = [error.name, error.message, error.code, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return text.includes("retryable") || text.includes("timeout") || text.includes("temporar") || text.includes("service unavailable");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAuthNotFoundError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  const text = [error.name, error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();
  return error.status === 404 || text.includes("not found") || text.includes("does not exist") || text.includes("user not found");
}

function logLeadgenRemovalFailure(params: {
  step: string;
  errorId: string;
  userId: string;
  userRole?: string | null;
  userEmail?: string | null;
  supabaseError?: SupabaseErrorLike | null;
  authError?: SupabaseErrorLike | null;
  dbError?: SupabaseErrorLike | null;
  note?: string;
}) {
  const { step, errorId, userId, userRole, userEmail, supabaseError, authError, dbError, note } = params;
  const error = supabaseError ?? authError ?? dbError ?? null;

  console.error("[LeadGen] Remove user failed.", {
    step,
    errorId,
    userId,
    userRole: userRole ?? null,
    userEmail: userEmail ?? null,
    note: note ?? null,
    supabaseError: supabaseError
      ? {
          name: supabaseError.name ?? null,
          message: supabaseError.message ?? null,
          code: supabaseError.code ?? null,
          details: supabaseError.details ?? null,
          hint: supabaseError.hint ?? null,
          status: supabaseError.status ?? null,
          serialized: supabaseError.serialized ?? null,
        }
      : null,
    authError: authError
      ? {
          name: authError.name ?? null,
          message: authError.message ?? null,
          code: authError.code ?? null,
          details: authError.details ?? null,
          hint: authError.hint ?? null,
          status: authError.status ?? null,
          serialized: authError.serialized ?? null,
        }
      : null,
    dbError: dbError
      ? {
          name: dbError.name ?? null,
          message: dbError.message ?? null,
          code: dbError.code ?? null,
          details: dbError.details ?? null,
          hint: dbError.hint ?? null,
          status: dbError.status ?? null,
          serialized: dbError.serialized ?? null,
        }
      : null,
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? null,
    errorCode: error?.code ?? null,
    errorDetails: error?.details ?? null,
    errorHint: error?.hint ?? null,
    errorStatus: error?.status ?? null,
    errorSerialized: error?.serialized ?? null,
  });
}

function buildRemovalFailureResult(params: {
  errorId: string;
  step: string;
  error: string;
  supabaseError?: SupabaseErrorLike | null;
  authError?: SupabaseErrorLike | null;
  dbError?: SupabaseErrorLike | null;
}): ActionResult {
  const source = params.supabaseError ?? params.authError ?? params.dbError ?? null;

  return {
    error: params.error,
    errorId: params.errorId,
    step: params.step,
    message: source?.message ?? source?.name,
    code: source?.code ?? (source?.status ? String(source.status) : undefined),
    details:
      source?.details ??
      (source?.serialized
        ? JSON.stringify(source.serialized)
        : undefined),
    hint: source?.hint,
  };
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof getSupabaseAdmin>, email: string): Promise<{ authUserId: string | null; authError?: SupabaseErrorLike }> {
  const targetEmail = email.trim().toLowerCase();
  if (!targetEmail) return { authUserId: null };

  let page = 1;
  const perPage = 200;
  const maxPages = 50;

  while (page <= maxPages) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { authUserId: null, authError: toSupabaseErrorLike(error) };

    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").trim().toLowerCase() === targetEmail);
    if (match?.id) return { authUserId: match.id };

    if (users.length < perPage) break;
    page += 1;
  }

  return { authUserId: null };
}

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

type DeleteClientDataResult =
  | { error: string }
  | {
      deletedEmails: number;
      deletedAppointments: number;
      deletedFollowUps: number;
      deletedActivities: number;
      deletedLeads: number;
      deletedCampaigns: number;
      deletedClientUsers: number;
    };

async function deleteLeadgenClientData(
  clientId: string,
  clientName: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<DeleteClientDataResult> {
  const { data: leadRows, error: leadReadError } = await supabase.from("leadgen_leads").select("id").eq("client_id", clientId);
  if (leadReadError) return { error: `Failed to read leads for ${clientName}.` };

  const leadIds = (leadRows ?? []).map((r) => r.id as string);

  const { data: emailsDeleted, error: emailsDeleteError } = await supabase
    .from("leadgen_emails")
    .delete()
    .eq("client_id", clientId)
    .select("id");
  if (emailsDeleteError) return { error: `Failed to delete emails for ${clientName}.` };

  const { data: apptsDeleted, error: apptsDeleteError } = await supabase
    .from("leadgen_appointments")
    .delete()
    .eq("client_id", clientId)
    .select("id");
  if (apptsDeleteError) return { error: `Failed to delete appointments for ${clientName}.` };

  let followUpsDeletedCount = 0;
  let activitiesDeletedCount = 0;
  if (leadIds.length > 0) {
    const { data: followUpsDeleted, error: followUpsDeleteError } = await supabase
      .from("leadgen_followups")
      .delete()
      .in("lead_id", leadIds)
      .select("id");
    if (followUpsDeleteError) return { error: `Failed to delete follow-ups for ${clientName}.` };
    followUpsDeletedCount = (followUpsDeleted ?? []).length;

    const { data: activitiesDeleted, error: activitiesDeleteError } = await supabase
      .from("leadgen_lead_activities")
      .delete()
      .in("lead_id", leadIds)
      .select("id");
    if (activitiesDeleteError) return { error: `Failed to delete lead activities for ${clientName}.` };
    activitiesDeletedCount = (activitiesDeleted ?? []).length;
  }

  const { data: leadsDeleted, error: leadsDeleteError } = await supabase.from("leadgen_leads").delete().eq("client_id", clientId).select("id");
  if (leadsDeleteError) return { error: `Failed to delete leads for ${clientName}.` };

  const { data: campaignsDeleted, error: campaignsDeleteError } = await supabase
    .from("leadgen_campaigns")
    .delete()
    .eq("client_id", clientId)
    .select("id");
  if (campaignsDeleteError) return { error: `Failed to delete campaigns for ${clientName}.` };

  const { data: clientUsersDeleted, error: clientUsersDeleteError } = await supabase
    .from("leadgen_users")
    .delete()
    .eq("client_id", clientId)
    .select("id");
  if (clientUsersDeleteError) return { error: `Failed to delete client users for ${clientName}.` };

  const { error: clientDeleteError } = await supabase.from("leadgen_clients").delete().eq("id", clientId);
  if (clientDeleteError) return { error: `Failed to delete client ${clientName}.` };

  return {
    deletedEmails: (emailsDeleted ?? []).length,
    deletedAppointments: (apptsDeleted ?? []).length,
    deletedFollowUps: followUpsDeletedCount,
    deletedActivities: activitiesDeletedCount,
    deletedLeads: (leadsDeleted ?? []).length,
    deletedCampaigns: (campaignsDeleted ?? []).length,
    deletedClientUsers: (clientUsersDeleted ?? []).length,
  };
}

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
  if (userId === currentAdmin.id) {
    console.error("[LeadGen] Remove user blocked: self-removal attempt.", {
      step: "guard_self_removal",
      errorId: "REMOVE_SELF_BLOCKED",
      userId,
      userRole: currentAdmin.role,
      userEmail: currentAdmin.email,
      errorMessage: "You can't remove your own account.",
    });
    return {
      error: "You can't remove your own account.",
      errorId: "REMOVE_SELF_BLOCKED",
      step: "Prevent self-removal",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const configError = toSupabaseErrorLike(new Error("Missing server-side Supabase admin configuration."));
    logLeadgenRemovalFailure({
      step: "validate_server_supabase_admin_config",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      userId,
      userRole: currentAdmin.role,
      userEmail: currentAdmin.email,
      authError: configError,
      note: "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY is missing on the server runtime.",
    });
    return buildRemovalFailureResult({
      error: "Failed to remove this user.",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      step: "Validate server Supabase config",
      authError: configError,
    });
  }

  const urlRef = projectRefFromSupabaseUrl(supabaseUrl);
  const keyRef = projectRefFromServiceRoleKey(serviceRoleKey);
  if (!urlRef) {
    const invalidUrlError = toSupabaseErrorLike(
      new Error("Unable to resolve Supabase project reference from URL.")
    );
    logLeadgenRemovalFailure({
      step: "validate_supabase_project_match",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      userId,
      userRole: currentAdmin.role,
      userEmail: currentAdmin.email,
      authError: {
        ...invalidUrlError,
        details: "NEXT_PUBLIC_SUPABASE_URL is not a valid Supabase project URL.",
      },
      note: "Supabase URL could not be parsed into a project reference.",
    });
    return buildRemovalFailureResult({
      error: "Failed to remove this user.",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      step: "Validate Supabase project linkage",
      authError: {
        ...invalidUrlError,
        details: "NEXT_PUBLIC_SUPABASE_URL is not a valid Supabase project URL.",
      },
    });
  }

  if (!keyRef) {
    const invalidKeyError = toSupabaseErrorLike(
      new Error("Unable to resolve Supabase project reference from service-role key.")
    );
    logLeadgenRemovalFailure({
      step: "validate_supabase_project_match",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      userId,
      userRole: currentAdmin.role,
      userEmail: currentAdmin.email,
      authError: {
        ...invalidKeyError,
        details: "SUPABASE_SERVICE_ROLE_KEY is missing, invalid, or not a JWT for this project.",
      },
      note: "Service-role key could not be parsed into a project reference.",
    });
    return buildRemovalFailureResult({
      error: "Failed to remove this user.",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      step: "Validate Supabase project linkage",
      authError: {
        ...invalidKeyError,
        details: "SUPABASE_SERVICE_ROLE_KEY is missing, invalid, or not a JWT for this project.",
      },
    });
  }

  if (urlRef !== keyRef) {
    const mismatchError = toSupabaseErrorLike(
      new Error("Supabase project mismatch between URL and service role key.")
    );
    logLeadgenRemovalFailure({
      step: "validate_supabase_project_match",
      errorId: "REMOVE_AUTH_CONFIG_MISMATCH",
      userId,
      userRole: currentAdmin.role,
      userEmail: currentAdmin.email,
      authError: {
        ...mismatchError,
        details: `URL project ref (${urlRef}) does not match key project ref (${keyRef}).`,
      },
      note: "Server runtime appears to use a service-role key for a different Supabase project.",
    });
    return buildRemovalFailureResult({
      error: "Failed to remove this user.",
      errorId: "REMOVE_AUTH_CONFIG_MISMATCH",
      step: "Validate Supabase project linkage",
      authError: {
        ...mismatchError,
        details: `URL project ref (${urlRef}) does not match key project ref (${keyRef}).`,
      },
    });
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (error) {
    const configError = toSupabaseErrorLike(error);
    logLeadgenRemovalFailure({
      step: "create_supabase_admin_client",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      userId,
      userRole: currentAdmin.role,
      userEmail: currentAdmin.email,
      authError: configError,
      note: "Failed to initialize the server-side Supabase admin client.",
    });
    return buildRemovalFailureResult({
      error: "Failed to remove this user.",
      errorId: "REMOVE_AUTH_CONFIG_FAILED",
      step: "Initialize server Supabase admin client",
      authError: configError,
    });
  }

  const { data: userRow, error: userReadError } = await admin.from("leadgen_users").select("id, full_name, email, role, client_id").eq("id", userId).maybeSingle();
  if (userReadError) {
    const safeError = toSupabaseErrorLike(userReadError);
    logLeadgenRemovalFailure({
      step: "load_user_before_removal",
      errorId: "REMOVE_PROFILE_FAILED",
      userId,
      userRole: null,
      userEmail: null,
      supabaseError: safeError,
      note: "Failed while loading the target user record before cleanup.",
    });
    return buildRemovalFailureResult({
      error: "Failed to remove this user.",
      errorId: "REMOVE_PROFILE_FAILED",
      step: "Load user profile",
      supabaseError: safeError,
    });
  }
  if (!userRow) {
    console.error("[LeadGen] Remove user failed: user profile not found.", {
      step: "load_user_before_removal",
      errorId: "REMOVE_PROFILE_NOT_FOUND",
      userId,
      userRole: null,
      userEmail: null,
      errorMessage: "User not found.",
    });
    logLeadgenRemovalFailure({
      step: "load_user_before_removal",
      errorId: "REMOVE_PROFILE_NOT_FOUND",
      userId,
      userRole: null,
      userEmail: null,
      note: "The requested leadgen_users row was not found.",
    });
    return {
      error: "User not found.",
      errorId: "REMOVE_PROFILE_NOT_FOUND",
      step: "Load user profile",
    };
  }

  // `leadgen_users.id` is expected to be the Auth UUID. If this value is
  // malformed or stale, fall back to finding the Auth user by email.
  let authUserId = isUuid(userId) ? userId : null;
  if (!authUserId && isUuid(userRow.id)) authUserId = userRow.id;

  if (!authUserId && userRow.email) {
    const lookup = await findAuthUserIdByEmail(admin, userRow.email);
    if (lookup.authError) {
      logLeadgenRemovalFailure({
        step: "lookup_auth_user_by_email",
        errorId: "REMOVE_AUTH_LOOKUP_FAILED",
        userId,
        userRole: userRow.role,
        userEmail: userRow.email,
        authError: lookup.authError,
        note: "Failed while searching Auth users by email to resolve a valid auth.users UUID.",
      });
      return buildRemovalFailureResult({
        error: "Failed to remove this user.",
        errorId: "REMOVE_AUTH_LOOKUP_FAILED",
        step: "Find auth user by email",
        authError: lookup.authError,
      });
    }
    authUserId = lookup.authUserId;
  }

  if (authUserId) {
    const { data: authUserLookup, error: authLookupError } = await admin.auth.admin.getUserById(authUserId);
    if (authLookupError) {
      const safeLookupError = toSupabaseErrorLike(authLookupError);
      if (!isAuthNotFoundError(safeLookupError)) {
        logLeadgenRemovalFailure({
          step: "get_auth_user_before_delete",
          errorId: "REMOVE_AUTH_LOOKUP_FAILED",
          userId,
          userRole: userRow.role,
          userEmail: userRow.email,
          authError: safeLookupError,
          note: "Failed while retrieving the target Auth user before delete.",
        });
        return buildRemovalFailureResult({
          error: "Failed to remove this user.",
          errorId: "REMOVE_AUTH_LOOKUP_FAILED",
          step: "Retrieve auth user",
          authError: safeLookupError,
        });
      }
      console.error("[LeadGen] Auth user not found during pre-delete lookup; continuing profile cleanup.", {
        step: "get_auth_user_before_delete",
        errorId: "REMOVE_AUTH_USER_ALREADY_MISSING",
        userId,
        resolvedAuthUserId: authUserId,
        userRole: userRow.role,
        userEmail: userRow.email,
        authError: safeLookupError,
      });
    } else if (!authUserLookup?.user?.id) {
      console.error("[LeadGen] Auth user lookup returned no user; continuing profile cleanup.", {
        step: "get_auth_user_before_delete",
        errorId: "REMOVE_AUTH_USER_ALREADY_MISSING",
        userId,
        resolvedAuthUserId: authUserId,
        userRole: userRow.role,
        userEmail: userRow.email,
      });
    } else {
      authUserId = authUserLookup.user.id;
      const maxDeleteAttempts = 3;
      let lastRetryableAuthError: SupabaseErrorLike | null = null;

      for (let attempt = 1; attempt <= maxDeleteAttempts; attempt += 1) {
        const { error: authDeleteError } = await admin.auth.admin.deleteUser(authUserId);
        if (!authDeleteError) {
          lastRetryableAuthError = null;
          break;
        }

        const safeAuthError = toSupabaseErrorLike(authDeleteError);
        console.error("[LeadGen] Auth user delete attempt failed.", {
          step: "delete_auth_user",
          errorId: "REMOVE_AUTH_USER_ATTEMPT_FAILED",
          userId,
          resolvedAuthUserId: authUserId,
          userRole: userRow.role,
          userEmail: userRow.email,
          attempt,
          maxAttempts: maxDeleteAttempts,
          authError: safeAuthError,
        });

        if (isAuthNotFoundError(safeAuthError)) {
          lastRetryableAuthError = null;
          break;
        }

        if (!isRetryableAuthError(safeAuthError)) {
          logLeadgenRemovalFailure({
            step: "delete_auth_user",
            errorId: "REMOVE_AUTH_USER_FAILED",
            userId,
            userRole: userRow.role,
            userEmail: userRow.email,
            authError: safeAuthError,
            note: "Non-retryable Auth delete error.",
          });
          return buildRemovalFailureResult({
            error: "Failed to remove this user.",
            errorId: "REMOVE_AUTH_USER_FAILED",
            step: "Delete auth user",
            authError: safeAuthError,
          });
        }

        lastRetryableAuthError = safeAuthError;
        if (attempt < maxDeleteAttempts) {
          await delay(250 * attempt);
        }
      }

      if (lastRetryableAuthError) {
        logLeadgenRemovalFailure({
          step: "delete_auth_user",
          errorId: "AUTH_PROVIDER_TEMPORARY_FAILURE",
          userId,
          userRole: userRow.role,
          userEmail: userRow.email,
          authError: lastRetryableAuthError,
          note: "Retryable Auth provider error persisted after max retries; CRM profile deletion intentionally skipped.",
        });
        return buildRemovalFailureResult({
          error: "Auth provider temporary failure. Please retry shortly.",
          errorId: "AUTH_PROVIDER_TEMPORARY_FAILURE",
          step: "Delete auth user",
          authError: lastRetryableAuthError,
        });
      }
    }
  } else {
    console.error("[LeadGen] No matching Auth user found; treating Auth deletion as already complete.", {
      step: "resolve_auth_user_id",
      errorId: "REMOVE_AUTH_USER_ALREADY_MISSING",
      userId,
      profileId: userRow.id,
      userRole: userRow.role,
      userEmail: userRow.email,
      note: "No auth.users row was found by UUID or email; continuing profile cleanup.",
    });
  }

  const { error: profileDeleteError } = await admin.from("leadgen_users").delete().eq("id", userId);
  if (profileDeleteError) {
    const safeDbError = toSupabaseErrorLike(profileDeleteError);
    logLeadgenRemovalFailure({
      step: "delete_profile_row",
      errorId: "REMOVE_PROFILE_FAILED",
      userId,
      userRole: userRow.role,
      userEmail: userRow.email,
      dbError: safeDbError,
      note: "Failed while deleting the leadgen_users profile row after auth cleanup.",
    });
    return buildRemovalFailureResult({
      error: "Failed to remove this user.",
      errorId: "REMOVE_PROFILE_FAILED",
      step: "Delete user profile",
      dbError: safeDbError,
    });
  }

  revalidatePath("/leadgen/admin/agents");
  revalidatePath("/leadgen/admin");
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
    const result = await deleteLeadgenClientData(client.id, client.name, supabase);
    if ("error" in result) return { error: result.error };

    summaries.push({
      clientId: client.id,
      clientName: client.name,
      deletedEmails: result.deletedEmails,
      deletedAppointments: result.deletedAppointments,
      deletedFollowUps: result.deletedFollowUps,
      deletedActivities: result.deletedActivities,
      deletedLeads: result.deletedLeads,
      deletedCampaigns: result.deletedCampaigns,
      deletedClientUsers: result.deletedClientUsers,
    });
  }

  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/admin/clients");
  revalidatePath("/leadgen/admin/leads");
  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/admin/emails");

  return { summaries };
}

export async function deleteLeadgenClientAction(clientId: string): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: client, error: clientError } = await supabase.from("leadgen_clients").select("id, name").eq("id", clientId).maybeSingle();
  if (clientError) return { error: "Failed to load the client." };
  if (!client) return { error: "Client not found." };
  if (client.name.trim() === "Brent's Essentials") return { error: "Brent's Essentials cannot be deleted." };

  const result = await deleteLeadgenClientData(client.id, client.name, supabase);
  if ("error" in result) return { error: result.error };

  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/admin/clients");
  revalidatePath("/leadgen/admin/leads");
  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/admin/emails");
  return {};
}

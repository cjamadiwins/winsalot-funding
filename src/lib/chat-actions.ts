"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase-server";
import { getSupabaseAdmin } from "./supabase-admin";
import { CHAT_MESSAGE_MAX_LENGTH } from "./chat-types";
import type { ActiveEmployeeOption } from "./chat-types";

// Server Actions for the shared Employee Chat system - called from any of
// the four dashboard route trees (Cleaning admin/agent, Lead Gen
// admin/agent), since chat is one system, not duplicated per CRM. Every
// action re-derives the caller's identity from their session here rather
// than trusting anything the client passes in, then still relies on RLS
// as the actual authorization boundary ("validate permissions on the
// server/database side, not only in the interface") - this file's own
// checks are a defense-in-depth layer, not the only gate.

type ActionResult = { error?: string };

type ResolvedIdentity = { id: string; fullName: string; isAdmin: boolean };

async function resolveIdentity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ResolvedIdentity | null> {
  const { data: authData, error } = await supabase.auth.getUser();
  if (error || !authData.user) return null;
  const uid = authData.user.id;

  const [{ data: crmRow }, { data: leadgenRow }] = await Promise.all([
    supabase.from("crm_users").select("full_name, email, role, active").eq("id", uid).maybeSingle(),
    supabase.from("leadgen_users").select("full_name, email, role, active").eq("id", uid).maybeSingle(),
  ]);

  const activeCrm = !!crmRow?.active && (crmRow.role === "admin" || crmRow.role === "agent");
  const activeLeadgen = !!leadgenRow?.active && (leadgenRow.role === "admin" || leadgenRow.role === "agent");
  if (!activeCrm && !activeLeadgen) return null;

  const fullName =
    (activeCrm && crmRow?.full_name) || (activeLeadgen && leadgenRow?.full_name) || authData.user.email || "Unknown";
  const isAdmin = (activeCrm && crmRow?.role === "admin") || (activeLeadgen && leadgenRow?.role === "admin");

  return { id: uid, fullName, isAdmin: !!isAdmin };
}

// Content is always rendered as plain text in React (no
// dangerouslySetInnerHTML anywhere in the chat UI), so script injection
// is prevented by never interpreting it as HTML in the first place -
// this only trims/length-checks it, matching the DB check constraint.
function sanitizeContent(raw: string): string | null {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed || trimmed.length > CHAT_MESSAGE_MAX_LENGTH) return null;
  return trimmed;
}

// "Prevent accidental duplicate message submissions": if the exact same
// sender posted the exact same content in the same place within the last
// few seconds (a double-tapped Send button, or a retried Server Action),
// treat the retry as already-succeeded instead of inserting a second row.
async function isRecentDuplicate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: "winsalot_company_messages" | "winsalot_dm_messages",
  senderId: string,
  content: string,
  conversationId: string | null
): Promise<boolean> {
  const since = new Date(Date.now() - 5000).toISOString();
  let query = supabase.from(table).select("id").eq("sender_id", senderId).eq("content", content).gte("created_at", since).limit(1);
  if (conversationId) query = query.eq("conversation_id", conversationId);
  const { data } = await query;
  return !!data && data.length > 0;
}

async function getAllActiveEmployeeIds(admin: SupabaseClient): Promise<string[]> {
  const [{ data: crmRows }, { data: leadgenRows }] = await Promise.all([
    admin.from("crm_users").select("id").eq("active", true).in("role", ["admin", "agent"]),
    admin.from("leadgen_users").select("id").eq("active", true).in("role", ["admin", "agent"]),
  ]);
  const ids = new Set<string>();
  (crmRows ?? []).forEach((r) => ids.add(r.id as string));
  (leadgenRows ?? []).forEach((r) => ids.add(r.id as string));
  return Array.from(ids);
}

// Where a notification for `userId` should link to - each employee's own
// "home" chat page, resolved from their own active CRM membership/role
// (Cleaning takes priority if active in both, an arbitrary but
// deterministic tie-break). Uses the service-role client since this is
// about the *recipient's* membership, not the caller's own visibility.
async function resolveChatHomePath(admin: SupabaseClient, userId: string): Promise<string> {
  const [{ data: crmRow }, { data: leadgenRow }] = await Promise.all([
    admin.from("crm_users").select("role, active").eq("id", userId).maybeSingle(),
    admin.from("leadgen_users").select("role, active").eq("id", userId).maybeSingle(),
  ]);
  if (crmRow?.active) return crmRow.role === "admin" ? "/admin/crm/chat" : "/agent/chat";
  if (leadgenRow?.active) return leadgenRow.role === "admin" ? "/leadgen/admin/chat" : "/leadgen/agent/chat";
  return "/agent/chat";
}

function revalidateAllChatRoutes() {
  revalidatePath("/agent/chat");
  revalidatePath("/admin/crm/chat");
  revalidatePath("/leadgen/agent/chat");
  revalidatePath("/leadgen/admin/chat");
  revalidatePath("/agent", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/leadgen/agent", "layout");
  revalidatePath("/leadgen/admin", "layout");
}

// ---------------------------------------------------------------------
// Company Chat
// ---------------------------------------------------------------------

export async function sendCompanyMessageAction(rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const content = sanitizeContent(rawContent);
  if (!content) return { error: "Enter a message (up to 2000 characters)." };

  if (await isRecentDuplicate(supabase, "winsalot_company_messages", identity.id, content, null)) {
    revalidateAllChatRoutes();
    return {};
  }

  const { error } = await supabase.from("winsalot_company_messages").insert({
    sender_id: identity.id,
    sender_name: identity.fullName,
    sender_is_admin: identity.isAdmin,
    content,
  });
  if (error) return { error: "Failed to send your message." };

  revalidateAllChatRoutes();
  return {};
}

export async function deleteCompanyMessageAction(messageId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { data: existing } = await supabase
    .from("winsalot_company_messages")
    .select("id, sender_id, sender_name, content")
    .eq("id", messageId)
    .maybeSingle();
  if (!existing) return { error: "Message not found." };

  const { error } = await supabase
    .from("winsalot_company_messages")
    .update({ deleted_at: new Date().toISOString(), deleted_by: identity.id, deleted_by_name: identity.fullName })
    .eq("id", messageId);
  if (error) return { error: "You can only delete your own recent messages." };

  if (existing.sender_id !== identity.id) {
    const admin = getSupabaseAdmin();
    await admin.from("winsalot_chat_audit_log").insert({
      action: "company_message_removed",
      target_id: messageId,
      target_sender_id: existing.sender_id,
      target_sender_name: existing.sender_name,
      performed_by: identity.id,
      performed_by_name: identity.fullName,
    });
  }

  revalidateAllChatRoutes();
  return {};
}

export async function markCompanyChatReadAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("winsalot_company_chat_read_state")
    .upsert({ user_id: identity.id, last_read_at: new Date().toISOString() });
  if (error) return { error: "Failed to update read status." };

  revalidateAllChatRoutes();
  return {};
}

// ---------------------------------------------------------------------
// Direct Messages
// ---------------------------------------------------------------------

export async function searchActiveEmployeesAction(query: string): Promise<{ error?: string; results?: ActiveEmployeeOption[] }> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const trimmed = query.trim();
  if (trimmed.length < 1) return { results: [] };

  // Uses the service-role client deliberately: an agent's own crm_users/
  // leadgen_users RLS only lets them see their own row, but every active
  // employee needs to be searchable by name for Direct Messages - this
  // function is the single, narrow, audited place that widens that,
  // returning only {id, name, isAdmin}, never email or any other field.
  const admin = getSupabaseAdmin();
  const [{ data: crmRows }, { data: leadgenRows }] = await Promise.all([
    admin.from("crm_users").select("id, full_name, role").eq("active", true).in("role", ["admin", "agent"]).ilike("full_name", `%${trimmed}%`),
    admin.from("leadgen_users").select("id, full_name, role").eq("active", true).in("role", ["admin", "agent"]).ilike("full_name", `%${trimmed}%`),
  ]);

  const byId = new Map<string, ActiveEmployeeOption>();
  for (const row of [...(crmRows ?? []), ...(leadgenRows ?? [])]) {
    if (row.id === identity.id) continue;
    const existing = byId.get(row.id as string);
    byId.set(row.id as string, {
      id: row.id as string,
      fullName: row.full_name as string,
      isAdmin: existing?.isAdmin || row.role === "admin",
    });
  }

  return { results: Array.from(byId.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)) };
}

export async function getOrCreateDmConversationAction(otherUserId: string): Promise<{ error?: string; conversationId?: string }> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (otherUserId === identity.id) return { error: "You can't message yourself." };

  const admin = getSupabaseAdmin();
  const { data: otherActive } = await admin.rpc("winsalot_is_active_employee", { uid: otherUserId });
  if (!otherActive) return { error: "That employee is not available to message." };

  const [participantOne, participantTwo] = [identity.id, otherUserId].sort();

  const { data: existing } = await supabase
    .from("winsalot_dm_conversations")
    .select("id")
    .eq("participant_one", participantOne)
    .eq("participant_two", participantTwo)
    .maybeSingle();
  if (existing) return { conversationId: existing.id };

  const { data: created, error } = await supabase
    .from("winsalot_dm_conversations")
    .insert({ participant_one: participantOne, participant_two: participantTwo })
    .select("id")
    .single();
  if (error || !created) return { error: "Failed to start the conversation." };

  return { conversationId: created.id };
}

export async function sendDmMessageAction(conversationId: string, rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const content = sanitizeContent(rawContent);
  if (!content) return { error: "Enter a message (up to 2000 characters)." };

  const { data: conversation } = await supabase
    .from("winsalot_dm_conversations")
    .select("id, participant_one, participant_two")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return { error: "Conversation not found." };

  if (await isRecentDuplicate(supabase, "winsalot_dm_messages", identity.id, content, conversationId)) {
    revalidateAllChatRoutes();
    return {};
  }

  const { error } = await supabase.from("winsalot_dm_messages").insert({
    conversation_id: conversationId,
    sender_id: identity.id,
    sender_name: identity.fullName,
    content,
  });
  if (error) return { error: "Failed to send your message." };

  const recipientId = conversation.participant_one === identity.id ? conversation.participant_two : conversation.participant_one;
  const admin = getSupabaseAdmin();
  const homePath = await resolveChatHomePath(admin, recipientId);
  const linkPath = `${homePath}?tab=dm&conversation=${conversationId}`;

  const { data: existingNotif } = await admin
    .from("winsalot_chat_notifications")
    .select("id")
    .eq("user_id", recipientId)
    .eq("link_path", linkPath)
    .eq("is_read", false)
    .maybeSingle();
  if (!existingNotif) {
    await admin.from("winsalot_chat_notifications").insert({
      user_id: recipientId,
      type: "dm",
      title: `${identity.fullName} sent you a message`,
      body: content.slice(0, 140),
      link_path: linkPath,
    });
  } else {
    // An unread notification for this conversation already exists -
    // refresh its preview/timestamp instead of piling up a second one
    // ("Do not create repeated notifications for the same message").
    await admin
      .from("winsalot_chat_notifications")
      .update({ title: `${identity.fullName} sent you a message`, body: content.slice(0, 140), created_at: new Date().toISOString() })
      .eq("id", existingNotif.id);
  }

  revalidateAllChatRoutes();
  return {};
}

export async function deleteDmMessageAction(messageId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("winsalot_dm_messages")
    .update({ deleted_at: new Date().toISOString(), deleted_by: identity.id, deleted_by_name: identity.fullName })
    .eq("id", messageId);
  if (error) return { error: "You can only delete your own recent messages." };

  revalidateAllChatRoutes();
  return {};
}

export async function markDmConversationReadAction(conversationId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("winsalot_dm_read_state")
    .upsert({ conversation_id: conversationId, user_id: identity.id, last_read_at: new Date().toISOString() });
  if (error) return { error: "Failed to update read status." };

  revalidateAllChatRoutes();
  return {};
}

// ---------------------------------------------------------------------
// Admin Announcements
// ---------------------------------------------------------------------

export async function sendAnnouncementAction(rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (!identity.isAdmin) return { error: "Only admins can post announcements." };

  const content = sanitizeContent(rawContent);
  if (!content) return { error: "Enter an announcement (up to 2000 characters)." };

  const { data: inserted, error } = await supabase
    .from("winsalot_announcements")
    .insert({ sender_id: identity.id, sender_name: identity.fullName, content })
    .select("id")
    .single();
  if (error || !inserted) return { error: "Failed to post the announcement." };

  const admin = getSupabaseAdmin();
  await admin.from("winsalot_chat_audit_log").insert({
    action: "announcement_created",
    target_id: inserted.id,
    target_sender_id: identity.id,
    target_sender_name: identity.fullName,
    performed_by: identity.id,
    performed_by_name: identity.fullName,
  });

  const recipientIds = (await getAllActiveEmployeeIds(admin)).filter((id) => id !== identity.id);
  if (recipientIds.length > 0) {
    const homePaths = await Promise.all(recipientIds.map((id) => resolveChatHomePath(admin, id)));
    await admin.from("winsalot_chat_notifications").insert(
      recipientIds.map((id, i) => ({
        user_id: id,
        type: "announcement" as const,
        title: `${identity.fullName} posted a new announcement`,
        body: content.slice(0, 140),
        link_path: `${homePaths[i]}?tab=announcements&highlight=${inserted.id}`,
      }))
    );
  }

  revalidateAllChatRoutes();
  return {};
}

export async function toggleAnnouncementPinAction(announcementId: string, pinned: boolean): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (!identity.isAdmin) return { error: "Only admins can pin announcements." };

  const { error } = await supabase.from("winsalot_announcements").update({ pinned }).eq("id", announcementId);
  if (error) return { error: "Failed to update the announcement." };

  const admin = getSupabaseAdmin();
  await admin.from("winsalot_chat_audit_log").insert({
    action: pinned ? "announcement_pinned" : "announcement_unpinned",
    target_id: announcementId,
    performed_by: identity.id,
    performed_by_name: identity.fullName,
  });

  revalidateAllChatRoutes();
  return {};
}

export async function deleteAnnouncementAction(announcementId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (!identity.isAdmin) return { error: "Only admins can remove announcements." };

  const { data: existing } = await supabase
    .from("winsalot_announcements")
    .select("id, sender_id, sender_name")
    .eq("id", announcementId)
    .maybeSingle();
  if (!existing) return { error: "Announcement not found." };

  const { error } = await supabase
    .from("winsalot_announcements")
    .update({ deleted_at: new Date().toISOString(), deleted_by: identity.id, deleted_by_name: identity.fullName })
    .eq("id", announcementId);
  if (error) return { error: "Failed to remove the announcement." };

  const admin = getSupabaseAdmin();
  await admin.from("winsalot_chat_audit_log").insert({
    action: "announcement_removed",
    target_id: announcementId,
    target_sender_id: existing.sender_id,
    target_sender_name: existing.sender_name,
    performed_by: identity.id,
    performed_by_name: identity.fullName,
  });

  revalidateAllChatRoutes();
  return {};
}

export async function markAnnouncementReadAction(announcementId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("winsalot_announcement_reads")
    .upsert({ announcement_id: announcementId, user_id: identity.id, read_at: new Date().toISOString() });
  if (error) return { error: "Failed to update read status." };

  revalidateAllChatRoutes();
  return {};
}

// ---------------------------------------------------------------------
// Chat notifications (shared bell integration)
// ---------------------------------------------------------------------

export async function markChatNotificationReadAction(notificationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;

  await supabase
    .from("winsalot_chat_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", authData.user.id);

  revalidateAllChatRoutes();
}

export async function markAllChatNotificationsReadAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;

  await supabase
    .from("winsalot_chat_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", authData.user.id)
    .eq("is_read", false);

  revalidateAllChatRoutes();
}

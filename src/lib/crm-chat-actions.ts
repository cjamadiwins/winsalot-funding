"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { getSupabaseAdmin } from "./supabase-admin";
import { sanitizeChatContent, isRecentDuplicateMessage } from "./chat-shared";
import type { ActiveEmployeeOption } from "./chat-types";

// Server Actions for the Winsalot Growth CRM's own Employee Chat - reads and
// writes ONLY crm_users and the crm_* chat tables (see
// supabase/migrations/0073_chat_crm_isolation.sql). Never touches
// leadgen_users or any leadgen_* table - that isolation is the whole
// point of this file existing separately from leadgen-chat-actions.ts.
// Every action re-derives the caller's identity from their session here
// rather than trusting anything the client passes in, then still relies
// on RLS as the actual authorization boundary ("validate permissions on
// the server/database side, not only in the interface") - this file's
// own checks are a defense-in-depth layer, not the only gate.

type ActionResult = { error?: string };
type ResolvedIdentity = { id: string; fullName: string; isAdmin: boolean };

async function resolveIdentity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ResolvedIdentity | null> {
  const { data: authData, error } = await supabase.auth.getUser();
  if (error || !authData.user) return null;

  const { data: row } = await supabase
    .from("crm_users")
    .select("full_name, role, active")
    .eq("id", authData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!row || (row.role !== "admin" && row.role !== "agent")) return null;

  return { id: authData.user.id, fullName: row.full_name, isAdmin: row.role === "admin" };
}

function revalidateChatRoutes() {
  revalidatePath("/agent/chat");
  revalidatePath("/admin/crm/chat");
  revalidatePath("/agent", "layout");
  revalidatePath("/admin", "layout");
}

// ---------------------------------------------------------------------
// Company Chat
// ---------------------------------------------------------------------

export async function sendCrmCompanyMessageAction(rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const content = sanitizeChatContent(rawContent);
  if (!content) return { error: "Enter a message (up to 2000 characters)." };

  if (await isRecentDuplicateMessage(supabase, "crm_company_messages", identity.id, content, null)) {
    revalidateChatRoutes();
    return {};
  }

  const { error } = await supabase.from("crm_company_messages").insert({
    sender_id: identity.id,
    sender_name: identity.fullName,
    sender_is_admin: identity.isAdmin,
    content,
  });
  if (error) return { error: "Failed to send your message." };

  revalidateChatRoutes();
  return {};
}

export async function deleteCrmCompanyMessageAction(messageId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { data: existing } = await supabase
    .from("crm_company_messages")
    .select("id, sender_id, sender_name, content")
    .eq("id", messageId)
    .maybeSingle();
  if (!existing) return { error: "Message not found." };

  const { error } = await supabase
    .from("crm_company_messages")
    .update({ deleted_at: new Date().toISOString(), deleted_by: identity.id, deleted_by_name: identity.fullName })
    .eq("id", messageId);
  if (error) return { error: "You can only delete your own recent messages." };

  if (existing.sender_id !== identity.id) {
    const admin = getSupabaseAdmin();
    await admin.from("crm_chat_audit_log").insert({
      action: "company_message_removed",
      target_id: messageId,
      target_sender_id: existing.sender_id,
      target_sender_name: existing.sender_name,
      performed_by: identity.id,
      performed_by_name: identity.fullName,
    });
  }

  revalidateChatRoutes();
  return {};
}

export async function editCrmCompanyMessageAction(messageId: string, rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const content = sanitizeChatContent(rawContent);
  if (!content) return { error: "Enter a message (up to 2000 characters)." };

  const { data: existing } = await supabase
    .from("crm_company_messages")
    .select("id, sender_id, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!existing) return { error: "Message not found." };
  if (existing.sender_id !== identity.id) return { error: "You can only edit your own messages." };
  if (existing.deleted_at) return { error: "This message has been removed." };

  const { error } = await supabase.from("crm_company_messages").update({ content }).eq("id", messageId);
  if (error) return { error: "Failed to save your changes." };

  revalidateChatRoutes();
  return {};
}

export async function markCrmCompanyChatReadAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("crm_company_chat_read_state")
    .upsert({ user_id: identity.id, last_read_at: new Date().toISOString() });
  if (error) return { error: "Failed to update read status." };

  revalidateChatRoutes();
  return {};
}

// ---------------------------------------------------------------------
// Direct Messages
// ---------------------------------------------------------------------

export async function searchCrmActiveEmployeesAction(query: string): Promise<{ error?: string; results?: ActiveEmployeeOption[] }> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const trimmed = query.trim();
  if (trimmed.length < 1) return { results: [] };

  // Service-role client deliberately: an agent's own crm_users RLS only
  // lets them see their own row, but every active Winsalot Growth CRM employee
  // needs to be searchable by name for Direct Messages - this returns
  // only {id, name, isAdmin}, never email or any other field, and never
  // queries leadgen_users.
  const admin = getSupabaseAdmin();
  const { data: rows } = await admin
    .from("crm_users")
    .select("id, full_name, role")
    .eq("active", true)
    .in("role", ["admin", "agent"])
    .ilike("full_name", `%${trimmed}%`);

  const results = (rows ?? [])
    .filter((r) => r.id !== identity.id)
    .map((r) => ({ id: r.id as string, fullName: r.full_name as string, isAdmin: r.role === "admin" }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { results };
}

export async function getOrCreateCrmDmConversationAction(otherUserId: string): Promise<{ error?: string; conversationId?: string }> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (otherUserId === identity.id) return { error: "You can't message yourself." };

  const admin = getSupabaseAdmin();
  const { data: otherRow } = await admin
    .from("crm_users")
    .select("active, role")
    .eq("id", otherUserId)
    .maybeSingle();
  if (!otherRow?.active || (otherRow.role !== "admin" && otherRow.role !== "agent")) {
    return { error: "That employee is not available to message." };
  }

  const [participantOne, participantTwo] = [identity.id, otherUserId].sort();

  const { data: existing } = await supabase
    .from("crm_dm_conversations")
    .select("id")
    .eq("participant_one", participantOne)
    .eq("participant_two", participantTwo)
    .maybeSingle();
  if (existing) return { conversationId: existing.id };

  const { data: created, error } = await supabase
    .from("crm_dm_conversations")
    .insert({ participant_one: participantOne, participant_two: participantTwo })
    .select("id")
    .single();
  if (error || !created) return { error: "Failed to start the conversation." };

  return { conversationId: created.id };
}

export async function sendCrmDmMessageAction(conversationId: string, rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const content = sanitizeChatContent(rawContent);
  if (!content) return { error: "Enter a message (up to 2000 characters)." };

  const { data: conversation } = await supabase
    .from("crm_dm_conversations")
    .select("id, participant_one, participant_two")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return { error: "Conversation not found." };

  if (await isRecentDuplicateMessage(supabase, "crm_dm_messages", identity.id, content, conversationId)) {
    revalidateChatRoutes();
    return {};
  }

  const { error } = await supabase.from("crm_dm_messages").insert({
    conversation_id: conversationId,
    sender_id: identity.id,
    sender_name: identity.fullName,
    content,
  });
  if (error) return { error: "Failed to send your message." };

  const recipientId = conversation.participant_one === identity.id ? conversation.participant_two : conversation.participant_one;
  const linkPath = `/agent/chat?tab=dm&conversation=${conversationId}`;
  const adminLinkPath = `/admin/crm/chat?tab=dm&conversation=${conversationId}`;

  const admin = getSupabaseAdmin();
  const { data: recipientRow } = await admin.from("crm_users").select("role").eq("id", recipientId).maybeSingle();
  const recipientLinkPath = recipientRow?.role === "admin" ? adminLinkPath : linkPath;

  const { data: existingNotif } = await admin
    .from("crm_notifications")
    .select("id")
    .eq("user_id", recipientId)
    .eq("link_path", recipientLinkPath)
    .eq("is_read", false)
    .maybeSingle();
  if (!existingNotif) {
    await admin.from("crm_notifications").insert({
      user_id: recipientId,
      title: `${identity.fullName} sent you a message`,
      body: content.slice(0, 140),
      link_path: recipientLinkPath,
    });
  } else {
    // An unread notification for this conversation already exists -
    // refresh its preview/timestamp instead of piling up a second one
    // ("Do not create repeated notifications for the same message").
    await admin
      .from("crm_notifications")
      .update({ title: `${identity.fullName} sent you a message`, body: content.slice(0, 140), created_at: new Date().toISOString() })
      .eq("id", existingNotif.id);
  }

  revalidateChatRoutes();
  return {};
}

export async function editCrmDmMessageAction(messageId: string, rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const content = sanitizeChatContent(rawContent);
  if (!content) return { error: "Enter a message (up to 2000 characters)." };

  const { data: existing } = await supabase
    .from("crm_dm_messages")
    .select("id, sender_id, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!existing) return { error: "Message not found." };
  if (existing.sender_id !== identity.id) return { error: "You can only edit your own messages." };
  if (existing.deleted_at) return { error: "This message has been removed." };

  const { error } = await supabase.from("crm_dm_messages").update({ content }).eq("id", messageId);
  if (error) return { error: "Failed to save your changes." };

  revalidateChatRoutes();
  return {};
}

export async function deleteCrmDmMessageAction(messageId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("crm_dm_messages")
    .update({ deleted_at: new Date().toISOString(), deleted_by: identity.id, deleted_by_name: identity.fullName })
    .eq("id", messageId);
  if (error) return { error: "You can only delete your own recent messages." };

  revalidateChatRoutes();
  return {};
}

export async function markCrmDmConversationReadAction(conversationId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("crm_dm_read_state")
    .upsert({ conversation_id: conversationId, user_id: identity.id, last_read_at: new Date().toISOString() });
  if (error) return { error: "Failed to update read status." };

  revalidateChatRoutes();
  return {};
}

// ---------------------------------------------------------------------
// Admin Announcements
// ---------------------------------------------------------------------

export async function sendCrmAnnouncementAction(rawContent: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (!identity.isAdmin) return { error: "Only admins can post announcements." };

  const content = sanitizeChatContent(rawContent);
  if (!content) return { error: "Enter an announcement (up to 2000 characters)." };

  const { data: inserted, error } = await supabase
    .from("crm_announcements")
    .insert({ sender_id: identity.id, sender_name: identity.fullName, content })
    .select("id")
    .single();
  if (error || !inserted) return { error: "Failed to post the announcement." };

  const admin = getSupabaseAdmin();
  await admin.from("crm_chat_audit_log").insert({
    action: "announcement_created",
    target_id: inserted.id,
    target_sender_id: identity.id,
    target_sender_name: identity.fullName,
    performed_by: identity.id,
    performed_by_name: identity.fullName,
  });

  const { data: recipients } = await admin
    .from("crm_users")
    .select("id, role")
    .eq("active", true)
    .in("role", ["admin", "agent"])
    .neq("id", identity.id);

  if (recipients && recipients.length > 0) {
    await admin.from("crm_notifications").insert(
      recipients.map((r) => ({
        user_id: r.id,
        title: `${identity.fullName} posted a new announcement`,
        body: content.slice(0, 140),
        link_path: `${r.role === "admin" ? "/admin/crm/chat" : "/agent/chat"}?tab=announcements&highlight=${inserted.id}`,
      }))
    );
  }

  revalidateChatRoutes();
  return {};
}

export async function toggleCrmAnnouncementPinAction(announcementId: string, pinned: boolean): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (!identity.isAdmin) return { error: "Only admins can pin announcements." };

  const { error } = await supabase.from("crm_announcements").update({ pinned }).eq("id", announcementId);
  if (error) return { error: "Failed to update the announcement." };

  const admin = getSupabaseAdmin();
  await admin.from("crm_chat_audit_log").insert({
    action: pinned ? "announcement_pinned" : "announcement_unpinned",
    target_id: announcementId,
    performed_by: identity.id,
    performed_by_name: identity.fullName,
  });

  revalidateChatRoutes();
  return {};
}

export async function deleteCrmAnnouncementAction(announcementId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };
  if (!identity.isAdmin) return { error: "Only admins can remove announcements." };

  const { data: existing } = await supabase
    .from("crm_announcements")
    .select("id, sender_id, sender_name")
    .eq("id", announcementId)
    .maybeSingle();
  if (!existing) return { error: "Announcement not found." };

  const { error } = await supabase
    .from("crm_announcements")
    .update({ deleted_at: new Date().toISOString(), deleted_by: identity.id, deleted_by_name: identity.fullName })
    .eq("id", announcementId);
  if (error) return { error: "Failed to remove the announcement." };

  const admin = getSupabaseAdmin();
  await admin.from("crm_chat_audit_log").insert({
    action: "announcement_removed",
    target_id: announcementId,
    target_sender_id: existing.sender_id,
    target_sender_name: existing.sender_name,
    performed_by: identity.id,
    performed_by_name: identity.fullName,
  });

  revalidateChatRoutes();
  return {};
}

export async function markCrmAnnouncementReadAction(announcementId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const identity = await resolveIdentity(supabase);
  if (!identity) return { error: "Your account does not have chat access." };

  const { error } = await supabase
    .from("crm_announcement_reads")
    .upsert({ announcement_id: announcementId, user_id: identity.id, read_at: new Date().toISOString() });
  if (error) return { error: "Failed to update read status." };

  revalidateChatRoutes();
  return {};
}

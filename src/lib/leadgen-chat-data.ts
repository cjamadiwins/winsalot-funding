import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { countDmUnread, countAnnouncementUnread } from "./chat-shared";
import type { AnnouncementRow, CompanyMessageRow, DmConversationSummary } from "./chat-types";

export type ChatPageData = {
  companyMessages: CompanyMessageRow[];
  companyUnreadCount: number;
  conversations: DmConversationSummary[];
  dmUnreadCount: number;
  announcements: AnnouncementRow[];
  announcementUnreadCount: number;
};

// Loads everything the Lead Gen CRM's chat UI needs for one page render,
// from the caller's own session-scoped client - RLS already restricts
// every query here to rows this specific leadgen_users employee may see.
// The one exception is resolving *other* DM participants' display names,
// which uses the service-role client deliberately (an agent's own
// leadgen_users RLS only lets them see their own row) - narrowed to
// exactly the participant ids this employee's own (already-authorized)
// conversations reference, and never queries crm_users.
export async function loadLeadgenChatPageData(
  supabase: SupabaseClient,
  identity: { id: string; isAdmin: boolean }
): Promise<ChatPageData> {
  const [
    { data: companyMessagesDesc },
    { data: readState },
    { data: conversationRows },
    { data: announcementRows },
    { data: announcementReadRows },
  ] = await Promise.all([
    supabase.from("leadgen_company_messages").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("leadgen_company_chat_read_state").select("last_read_at").eq("user_id", identity.id).maybeSingle(),
    supabase
      .from("leadgen_dm_conversations")
      .select("*")
      .or(`participant_one.eq.${identity.id},participant_two.eq.${identity.id}`)
      .order("last_message_at", { ascending: false }),
    supabase.from("leadgen_announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    supabase.from("leadgen_announcement_reads").select("announcement_id").eq("user_id", identity.id),
  ]);

  const companyMessages = [...(companyMessagesDesc ?? [])].reverse() as CompanyMessageRow[];
  const lastCompanyRead = readState?.last_read_at ? new Date(readState.last_read_at).getTime() : 0;
  const companyUnreadCount = companyMessages.filter(
    (m) => m.sender_id !== identity.id && new Date(m.created_at).getTime() > lastCompanyRead
  ).length;

  const conversations = conversationRows ?? [];
  const readByConversation = await loadDmReadState(supabase, identity.id);
  const lastMessageByConversation = await loadLastDmMessages(
    supabase,
    conversations.map((c) => c.id)
  );
  const unreadCountByConversation = await countUnreadDmMessagesPerConversation(supabase, conversations, identity.id, readByConversation);

  const otherUserIds = conversations.map((c) => (c.participant_one === identity.id ? c.participant_two : c.participant_one));
  const namesById = await resolveLeadgenEmployeeNames(otherUserIds);

  const conversationSummaries: DmConversationSummary[] = conversations
    .map((c) => {
      const otherUserId = c.participant_one === identity.id ? c.participant_two : c.participant_one;
      const lastMessage = lastMessageByConversation.get(c.id);
      return {
        conversationId: c.id,
        otherUserId,
        otherUserName: namesById.get(otherUserId) ?? "Former employee",
        lastMessageAt: c.last_message_at,
        lastMessagePreview: lastMessage?.deleted_at ? "Message removed" : lastMessage?.content ?? null,
        unreadCount: unreadCountByConversation.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  const readAnnouncementIds = new Set((announcementReadRows ?? []).map((r) => r.announcement_id as string));
  const announcements = (announcementRows ?? []) as AnnouncementRow[];
  const announcementUnreadCount = announcements.filter((a) => !readAnnouncementIds.has(a.id)).length;

  return {
    companyMessages,
    companyUnreadCount,
    conversations: conversationSummaries,
    dmUnreadCount: Array.from(unreadCountByConversation.values()).reduce((sum, n) => sum + n, 0),
    announcements,
    announcementUnreadCount,
  };
}

// Lightweight version of the counts above, for the sidebar "Chat" nav
// badge - company chat is deliberately excluded, same as the rest of the
// app never badging a high-volume shared feed.
export async function loadLeadgenChatUnreadCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const [dmUnread, announcementUnread] = await Promise.all([
    countDmUnread(
      supabase,
      { conversations: "leadgen_dm_conversations", messages: "leadgen_dm_messages", readState: "leadgen_dm_read_state" },
      userId
    ),
    countAnnouncementUnread(supabase, { announcements: "leadgen_announcements", reads: "leadgen_announcement_reads" }, userId),
  ]);
  return dmUnread + announcementUnread;
}

async function loadDmReadState(supabase: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from("leadgen_dm_read_state").select("conversation_id, last_read_at").eq("user_id", userId);
  const map = new Map<string, string>();
  (data ?? []).forEach((r) => map.set(r.conversation_id as string, r.last_read_at as string));
  return map;
}

async function loadLastDmMessages(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Map<string, { content: string; deleted_at: string | null }>> {
  const map = new Map<string, { content: string; deleted_at: string | null }>();
  if (conversationIds.length === 0) return map;

  const { data } = await supabase
    .from("leadgen_dm_messages")
    .select("conversation_id, content, deleted_at, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  for (const row of data ?? []) {
    if (!map.has(row.conversation_id as string)) {
      map.set(row.conversation_id as string, { content: row.content as string, deleted_at: row.deleted_at as string | null });
    }
  }
  return map;
}

async function countUnreadDmMessagesPerConversation(
  supabase: SupabaseClient,
  conversations: { id: string }[],
  userId: string,
  readByConversation: Map<string, string>
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (conversations.length === 0) return counts;

  const { data } = await supabase
    .from("leadgen_dm_messages")
    .select("conversation_id, sender_id, created_at")
    .in(
      "conversation_id",
      conversations.map((c) => c.id)
    );

  for (const row of data ?? []) {
    if (row.sender_id === userId) continue;
    const lastRead = readByConversation.get(row.conversation_id as string);
    if (lastRead && new Date(row.created_at as string).getTime() <= new Date(lastRead).getTime()) continue;
    counts.set(row.conversation_id as string, (counts.get(row.conversation_id as string) ?? 0) + 1);
  }
  return counts;
}

async function resolveLeadgenEmployeeNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return map;

  const admin = getSupabaseAdmin();
  const { data: rows } = await admin.from("leadgen_users").select("id, full_name").in("id", uniqueIds);
  for (const row of rows ?? []) {
    map.set(row.id as string, row.full_name as string);
  }
  return map;
}

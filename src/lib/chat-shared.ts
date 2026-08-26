import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_MESSAGE_MAX_LENGTH } from "./chat-types";

// Generic, identity-agnostic chat helpers shared by the Winsalot Growth CRM
// (crm-chat-actions.ts/crm-chat-data.ts) and Lead Gen CRM
// (leadgen-chat-actions.ts/leadgen-chat-data.ts) chat implementations.
// Every function here takes its table name(s) as an explicit parameter
// and never branches on which CRM is calling it, so this file has no
// notion of - and can't accidentally leak across - a CRM boundary; it's
// the same kind of shared *utility*, not shared *data*, as the DB's own
// winsalot_chat_enforce_soft_delete_only() trigger reused by both CRMs'
// tables in supabase/migrations/0073_chat_crm_isolation.sql.

// Content is always rendered as plain text in React (no
// dangerouslySetInnerHTML anywhere in the chat UI), so script injection
// is prevented by never interpreting it as HTML in the first place -
// this only trims/length-checks it, matching the DB check constraint.
export function sanitizeChatContent(raw: string): string | null {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed || trimmed.length > CHAT_MESSAGE_MAX_LENGTH) return null;
  return trimmed;
}

// "Prevent accidental duplicate message submissions": if the exact same
// sender posted the exact same content in the same place within the last
// few seconds (a double-tapped Send button, or a retried Server Action),
// treat the retry as already-succeeded instead of inserting a second row.
export async function isRecentDuplicateMessage(
  supabase: SupabaseClient,
  table: string,
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

export type DmUnreadTables = { conversations: string; messages: string; readState: string };

export async function countDmUnread(supabase: SupabaseClient, tables: DmUnreadTables, userId: string): Promise<number> {
  const { data: conversations } = await supabase
    .from(tables.conversations)
    .select("id")
    .or(`participant_one.eq.${userId},participant_two.eq.${userId}`);
  const ids = (conversations ?? []).map((c) => c.id as string);
  if (ids.length === 0) return 0;

  const { data: readState } = await supabase.from(tables.readState).select("conversation_id, last_read_at").eq("user_id", userId);
  const readMap = new Map<string, string>();
  (readState ?? []).forEach((r) => readMap.set(r.conversation_id as string, r.last_read_at as string));

  const { data: messages } = await supabase.from(tables.messages).select("conversation_id, sender_id, created_at").in("conversation_id", ids);

  let count = 0;
  for (const m of messages ?? []) {
    if (m.sender_id === userId) continue;
    const lastRead = readMap.get(m.conversation_id as string);
    if (lastRead && new Date(m.created_at as string).getTime() <= new Date(lastRead).getTime()) continue;
    count++;
  }
  return count;
}

export async function countAnnouncementUnread(
  supabase: SupabaseClient,
  tables: { announcements: string; reads: string },
  userId: string
): Promise<number> {
  const [{ data: announcements }, { data: reads }] = await Promise.all([
    supabase.from(tables.announcements).select("id"),
    supabase.from(tables.reads).select("announcement_id").eq("user_id", userId),
  ]);
  const readIds = new Set((reads ?? []).map((r) => r.announcement_id as string));
  return (announcements ?? []).filter((a) => !readIds.has(a.id as string)).length;
}

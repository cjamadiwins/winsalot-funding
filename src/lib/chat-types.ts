// Employee Chat types - structurally identical shapes reused by two fully
// independent chat implementations, one per CRM (src/lib/crm-chat-*.ts for
// Cleaning, src/lib/leadgen-chat-*.ts for Lead Gen; see
// supabase/migrations/0073_chat_crm_isolation.sql). Sharing these type
// definitions is safe - they're just row shapes, not data or identity -
// but no server action, query, or table name is ever shared between the
// two CRMs.

export const CHAT_MESSAGE_MAX_LENGTH = 2000;

// A caller-provided uuid the server checks was minted client-side within
// the last few seconds and not seen before, so a double-tapped Send
// button (or a retried Server Action) can never post the same message
// twice ("Prevent accidental duplicate message submissions").
export const CHAT_CLIENT_TOKEN_MAX_LENGTH = 64;

export type ChatIdentity = {
  id: string;
  fullName: string;
  isAdmin: boolean;
};

export type CompanyMessageRow = {
  id: string;
  created_at: string;
  sender_id: string;
  sender_name: string;
  sender_is_admin: boolean;
  content: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
};

export type DmConversationRow = {
  id: string;
  created_at: string;
  participant_one: string;
  participant_two: string;
  last_message_at: string;
};

export type DmMessageRow = {
  id: string;
  conversation_id: string;
  created_at: string;
  sender_id: string;
  sender_name: string;
  content: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
};

export type AnnouncementRow = {
  id: string;
  created_at: string;
  sender_id: string;
  sender_name: string;
  content: string;
  pinned: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
};

export type ChatNotificationRow = {
  id: string;
  created_at: string;
  user_id: string;
  type: "dm" | "announcement";
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  read_at: string | null;
};

// A conversation the current user can see, with the other participant's
// name resolved and an unread count already computed - what the Direct
// Messages panel actually renders per row, so the client never needs to
// separately fetch "who is the other person" or "is this active employee
// online" per row.
export type DmConversationSummary = {
  conversationId: string;
  otherUserId: string;
  otherUserName: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
};

export type ActiveEmployeeOption = {
  id: string;
  fullName: string;
  isAdmin: boolean;
};

const TORONTO_TIME_ZONE = "America/Toronto";

// "2:41 PM" - Toronto-local, used for same-day message timestamps.
export function formatChatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// "Aug 22, 2026" - Toronto-local, used for date separators / older items.
export function formatChatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

// "YYYY-MM-DD" for `date` as it falls in Toronto time, so consecutive
// messages can be grouped under the same date-separator correctly
// regardless of what timezone the server process itself runs in.
function torontoDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// Today/Yesterday/"Aug 22, 2026" - Toronto-local, for date-separator
// headers between groups of messages in a thread.
export function formatChatDateSeparator(iso: string): string {
  const key = torontoDateKey(iso);
  const todayKey = torontoDateKey(new Date().toISOString());
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = torontoDateKey(yesterday.toISOString());

  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return formatChatDate(iso);
}

export function isSameChatDay(a: string, b: string): boolean {
  return torontoDateKey(a) === torontoDateKey(b);
}

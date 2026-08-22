"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  formatChatDateSeparator,
  isSameChatDay,
  type ActiveEmployeeOption,
  type DmConversationSummary,
  type DmMessageRow,
} from "@/lib/chat-types";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";
import { usePresenceOnlineUsers } from "./usePresence";

type ActionResult = { error?: string };

export default function DirectMessagesPanel({
  identity,
  initialConversations,
  initialConversationId,
  messagesTable,
  presenceChannel,
  searchActiveEmployees,
  getOrCreateConversation,
  sendMessage,
  editMessage,
  deleteMessage,
  markConversationRead,
}: {
  identity: { id: string };
  initialConversations: DmConversationSummary[];
  initialConversationId?: string;
  messagesTable: string;
  presenceChannel: string;
  searchActiveEmployees: (query: string) => Promise<{ error?: string; results?: ActiveEmployeeOption[] }>;
  getOrCreateConversation: (otherUserId: string) => Promise<{ error?: string; conversationId?: string }>;
  sendMessage: (conversationId: string, content: string) => Promise<ActionResult>;
  editMessage: (id: string, content: string) => Promise<ActionResult>;
  deleteMessage: (id: string) => Promise<ActionResult>;
  markConversationRead: (conversationId: string) => Promise<ActionResult>;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const onlineUsers = usePresenceOnlineUsers(supabase, identity.id, presenceChannel);

  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<DmMessageRow[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ActiveEmployeeOption[]>([]);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find((c) => c.conversationId === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    let ignore = false;
    (async () => {
      const { data } = await supabase
        .from(messagesTable)
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (ignore) return;
      const asc = ((data ?? []) as DmMessageRow[]).reverse();
      setMessages(asc);
      setHasMoreOlder(asc.length >= 50);
      await markConversationRead(selectedId);
      if (ignore) return;
      setConversations((prev) => prev.map((c) => (c.conversationId === selectedId ? { ...c, unreadCount: 0 } : c)));
    })();
    return () => {
      ignore = true;
    };
  }, [selectedId, supabase, messagesTable, markConversationRead]);

  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`${presenceChannel}-dm-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: messagesTable, filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as DmMessageRow]);
          markConversationRead(selectedId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: messagesTable, filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          setMessages((prev) => prev.map((m) => (m.id === (payload.new as DmMessageRow).id ? (payload.new as DmMessageRow) : m)));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedId, messagesTable, presenceChannel, markConversationRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const trimmedSearchQuery = searchQuery.trim();
  const displaySearchResults = trimmedSearchQuery.length < 1 ? [] : searchResults;
  const searching = trimmedSearchQuery.length >= 1 && trimmedSearchQuery !== lastSearchedQuery;

  useEffect(() => {
    if (trimmedSearchQuery.length < 1) return;
    const timeout = setTimeout(async () => {
      const result = await searchActiveEmployees(trimmedSearchQuery);
      setSearchResults(result.results ?? []);
      setLastSearchedQuery(trimmedSearchQuery);
    }, 250);
    return () => clearTimeout(timeout);
  }, [trimmedSearchQuery, searchActiveEmployees]);

  async function handleStartConversation(employee: ActiveEmployeeOption) {
    const result = await getOrCreateConversation(employee.id);
    if (result.error || !result.conversationId) {
      setError(result.error ?? "Failed to start the conversation.");
      return;
    }
    const conversationId = result.conversationId;
    setConversations((prev) => {
      if (prev.some((c) => c.conversationId === conversationId)) return prev;
      return [
        {
          conversationId,
          otherUserId: employee.id,
          otherUserName: employee.fullName,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: null,
          unreadCount: 0,
        },
        ...prev,
      ];
    });
    setSearchQuery("");
    setSearchResults([]);
    setSelectedId(conversationId);
  }

  async function handleLoadOlder() {
    if (!selectedId || messages.length === 0) return;
    setLoadingOlder(true);
    const { data } = await supabase
      .from(messagesTable)
      .select("*")
      .eq("conversation_id", selectedId)
      .lt("created_at", messages[0].created_at)
      .order("created_at", { ascending: false })
      .limit(50);
    setLoadingOlder(false);
    const older = ((data ?? []) as DmMessageRow[]).reverse();
    setHasMoreOlder(older.length >= 50);
    setMessages((prev) => [...older, ...prev]);
  }

  async function handleDelete(id: string) {
    const result = await deleteMessage(id);
    if (result.error) setError(result.error);
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Conversation list - hidden on mobile once a conversation is open */}
      <div className={`w-full shrink-0 border-[var(--color-border)] md:w-72 md:border-r ${selectedId ? "hidden md:block" : "block"}`}>
        <div className="border-b border-[var(--color-border)] p-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employees..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900"
          />
          {trimmedSearchQuery && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              {searching && <p className="px-3 py-2 text-[12px] text-slate-500">Searching...</p>}
              {!searching && displaySearchResults.length === 0 && <p className="px-3 py-2 text-[12px] text-slate-500">No employees found.</p>}
              {displaySearchResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleStartConversation(r)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50"
                >
                  <span className={`h-2 w-2 rounded-full ${onlineUsers.has(r.id) ? "bg-emerald-500" : "bg-slate-300"}`} />
                  {r.fullName}
                  {r.isAdmin && <span className="text-[10.5px] text-slate-400">Admin</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-y-auto">
          {conversations.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--color-text-muted)]">
              Search for a coworker above to start a conversation.
            </p>
          )}
          {conversations.map((c) => (
            <button
              key={c.conversationId}
              type="button"
              onClick={() => setSelectedId(c.conversationId)}
              className={`flex w-full items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3 text-left transition hover:bg-slate-50 ${
                selectedId === c.conversationId ? "bg-slate-50" : ""
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${onlineUsers.has(c.otherUserId) ? "bg-emerald-500" : "bg-slate-300"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-[var(--color-ink-strong)]">{c.otherUserName}</p>
                <p className="truncate text-[12px] text-[var(--color-text-muted)]">{c.lastMessagePreview ?? "No messages yet"}</p>
              </div>
              {c.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10.5px] font-semibold text-white">
                  {c.unreadCount > 9 ? "9+" : c.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Active thread */}
      <div className={`flex min-w-0 flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!selectedConversation ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
            Select a conversation to start messaging.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <button type="button" onClick={() => setSelectedId(undefined)} className="text-[13px] text-[var(--crm-accent,#3e7ef7)] md:hidden">
                Back
              </button>
              <span className={`h-2 w-2 rounded-full ${onlineUsers.has(selectedConversation.otherUserId) ? "bg-emerald-500" : "bg-slate-300"}`} />
              <span className="text-[14px] font-semibold text-[var(--color-ink-strong)]">{selectedConversation.otherUserName}</span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {hasMoreOlder && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                    className="text-[12px] font-semibold text-[var(--crm-accent,#3e7ef7)] hover:underline disabled:opacity-50"
                  >
                    {loadingOlder ? "Loading..." : "Load older messages"}
                  </button>
                </div>
              )}
              {messages.map((m, i) => {
                const showDateSeparator = i === 0 || !isSameChatDay(messages[i - 1].created_at, m.created_at);
                return (
                  <div key={m.id}>
                    {showDateSeparator && (
                      <div className="my-3 text-center text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                        {formatChatDateSeparator(m.created_at)}
                      </div>
                    )}
                    <MessageBubble
                      senderName={m.sender_name}
                      content={m.content}
                      createdAt={m.created_at}
                      editedAt={m.edited_at}
                      isOwn={m.sender_id === identity.id}
                      isDeleted={!!m.deleted_at}
                      canDelete={!m.deleted_at && m.sender_id === identity.id}
                      onDelete={() => handleDelete(m.id)}
                      canEdit={m.sender_id === identity.id}
                      onEdit={(content) => editMessage(m.id, content)}
                    />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error && <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700">{error}</p>}

            <ChatComposer
              placeholder={`Message ${selectedConversation.otherUserName}...`}
              onSend={async (content) => {
                const result = await sendMessage(selectedConversation.conversationId, content);
                if (result.error) setError(result.error);
                return result;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

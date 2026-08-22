"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { formatChatDateSeparator, isSameChatDay, type CompanyMessageRow } from "@/lib/chat-types";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";

type ActionResult = { error?: string };

export default function CompanyChatPanel({
  identity,
  initialMessages,
  highlightId,
  tableName,
  realtimeChannel,
  sendMessage,
  deleteMessage,
  markRead,
}: {
  identity: { id: string; isAdmin: boolean };
  initialMessages: CompanyMessageRow[];
  highlightId?: string;
  tableName: string;
  realtimeChannel: string;
  sendMessage: (content: string) => Promise<ActionResult>;
  deleteMessage: (id: string) => Promise<ActionResult>;
  markRead: () => Promise<ActionResult>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMoreOlder, setHasMoreOlder] = useState(initialMessages.length >= 50);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    markRead();
    const channel = supabase
      .channel(realtimeChannel)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: tableName }, (payload) => {
        setMessages((prev) => [...prev, payload.new as CompanyMessageRow]);
        markRead();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: tableName }, (payload) => {
        setMessages((prev) => prev.map((m) => (m.id === (payload.new as CompanyMessageRow).id ? (payload.new as CompanyMessageRow) : m)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, realtimeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`company-message-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, messages]);

  async function handleLoadOlder() {
    if (messages.length === 0) return;
    setLoadingOlder(true);
    const oldest = messages[0].created_at;
    const { data } = await supabase
      .from(tableName)
      .select("*")
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(50);
    setLoadingOlder(false);
    const older = ((data ?? []) as CompanyMessageRow[]).reverse();
    setHasMoreOlder(older.length >= 50);
    setMessages((prev) => [...older, ...prev]);
  }

  async function handleDelete(id: string) {
    const result = await deleteMessage(id);
    if (result.error) setError(result.error);
  }

  return (
    <div className="flex h-full flex-col">
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

        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">No messages yet. Say hello!</p>
        )}

        {messages.map((m, i) => {
          const showDateSeparator = i === 0 || !isSameChatDay(messages[i - 1].created_at, m.created_at);
          return (
            <div key={m.id} id={`company-message-${m.id}`}>
              {showDateSeparator && (
                <div className="my-3 text-center text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  {formatChatDateSeparator(m.created_at)}
                </div>
              )}
              <MessageBubble
                senderName={m.sender_name}
                isAdminSender={m.sender_is_admin}
                content={m.content}
                createdAt={m.created_at}
                isOwn={m.sender_id === identity.id}
                isDeleted={!!m.deleted_at}
                canDelete={!m.deleted_at && (m.sender_id === identity.id || identity.isAdmin)}
                onDelete={() => handleDelete(m.id)}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700">{error}</p>}

      <ChatComposer
        placeholder="Message everyone at Winsalot..."
        onSend={async (content) => {
          const result = await sendMessage(content);
          if (result.error) setError(result.error);
          return result;
        }}
      />
    </div>
  );
}

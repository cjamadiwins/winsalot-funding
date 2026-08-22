"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { sendCompanyMessageAction, deleteCompanyMessageAction, markCompanyChatReadAction } from "@/lib/chat-actions";
import { formatChatDateSeparator, isSameChatDay, type CompanyMessageRow } from "@/lib/chat-types";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";

export default function CompanyChatPanel({
  identity,
  initialMessages,
  highlightId,
}: {
  identity: { id: string; isAdmin: boolean };
  initialMessages: CompanyMessageRow[];
  highlightId?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMoreOlder, setHasMoreOlder] = useState(initialMessages.length >= 50);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    markCompanyChatReadAction();
    const channel = supabase
      .channel("winsalot-company-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "winsalot_company_messages" }, (payload) => {
        setMessages((prev) => [...prev, payload.new as CompanyMessageRow]);
        markCompanyChatReadAction();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "winsalot_company_messages" }, (payload) => {
        setMessages((prev) => prev.map((m) => (m.id === (payload.new as CompanyMessageRow).id ? (payload.new as CompanyMessageRow) : m)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      .from("winsalot_company_messages")
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
    const result = await deleteCompanyMessageAction(id);
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
          const result = await sendCompanyMessageAction(content);
          if (result.error) setError(result.error);
          return result;
        }}
      />
    </div>
  );
}

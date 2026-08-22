"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  sendAnnouncementAction,
  toggleAnnouncementPinAction,
  deleteAnnouncementAction,
  markAnnouncementReadAction,
} from "@/lib/chat-actions";
import { formatChatDate, formatChatTime, type AnnouncementRow } from "@/lib/chat-types";
import ChatComposer from "./ChatComposer";

export default function AnnouncementsPanel({
  identity,
  initialAnnouncements,
  highlightId,
}: {
  identity: { id: string; isAdmin: boolean };
  initialAnnouncements: AnnouncementRow[];
  highlightId?: string;
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    for (const a of initialAnnouncements) {
      markAnnouncementReadAction(a.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("winsalot-announcements")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "winsalot_announcements" }, (payload) => {
        const row = payload.new as AnnouncementRow;
        setAnnouncements((prev) => [row, ...prev]);
        markAnnouncementReadAction(row.id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "winsalot_announcements" }, (payload) => {
        setAnnouncements((prev) => prev.map((a) => (a.id === (payload.new as AnnouncementRow).id ? (payload.new as AnnouncementRow) : a)));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`announcement-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, announcements]);

  const sorted = [...announcements].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  async function handlePin(id: string, pinned: boolean) {
    const result = await toggleAnnouncementPinAction(id, pinned);
    if (result.error) setError(result.error);
  }

  async function handleDelete(id: string) {
    const result = await deleteAnnouncementAction(id);
    if (result.error) setError(result.error);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {sorted.length === 0 && <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">No announcements yet.</p>}

        {sorted.map((a) => (
          <div
            key={a.id}
            id={`announcement-${a.id}`}
            className={`rounded-xl border p-4 ${a.pinned ? "border-amber-300 bg-amber-50" : "border-[var(--color-border)] bg-[var(--crm-surface)]"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--color-ink-strong)]">{a.sender_name}</span>
                <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-sky-800">Admin</span>
                {a.pinned && (
                  <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-900">
                    Pinned
                  </span>
                )}
              </div>
              <span className="whitespace-nowrap text-[11px] text-[var(--color-text-muted)]">
                {formatChatDate(a.created_at)} · {formatChatTime(a.created_at)}
              </span>
            </div>

            {a.deleted_at ? (
              <p className="mt-2 text-sm italic text-[var(--color-text-muted)]">Announcement removed</p>
            ) : (
              <p className="mt-2 whitespace-pre-wrap break-words text-[13.5px] text-[var(--color-ink)]">{a.content}</p>
            )}

            {identity.isAdmin && !a.deleted_at && (
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => handlePin(a.id, !a.pinned)}
                  className="text-[12px] font-semibold text-[var(--crm-accent,#3e7ef7)] hover:underline"
                >
                  {a.pinned ? "Unpin" : "Pin"}
                </button>
                <button type="button" onClick={() => handleDelete(a.id)} className="text-[12px] font-semibold text-rose-600 hover:underline">
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700">{error}</p>}

      {identity.isAdmin ? (
        <ChatComposer
          placeholder="Post an announcement to all employees..."
          submitLabel="Post"
          onSend={async (content) => {
            const result = await sendAnnouncementAction(content);
            if (result.error) setError(result.error);
            return result;
          }}
        />
      ) : (
        <p className="border-t border-[var(--color-border)] bg-[var(--crm-surface)] px-4 py-3 text-center text-[12px] text-[var(--color-text-muted)]">
          Only admins can post announcements.
        </p>
      )}
    </div>
  );
}

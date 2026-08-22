"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AnnouncementRow, CompanyMessageRow, DmConversationSummary } from "@/lib/chat-types";
import CompanyChatPanel from "./CompanyChatPanel";
import DirectMessagesPanel from "./DirectMessagesPanel";
import AnnouncementsPanel from "./AnnouncementsPanel";

type Tab = "company" | "dm" | "announcements";

export default function ChatPageClient({
  identity,
  companyMessages,
  companyUnreadCount,
  conversations,
  dmUnreadCount,
  announcements,
  announcementUnreadCount,
}: {
  identity: { id: string; isAdmin: boolean };
  companyMessages: CompanyMessageRow[];
  companyUnreadCount: number;
  conversations: DmConversationSummary[];
  dmUnreadCount: number;
  announcements: AnnouncementRow[];
  announcementUnreadCount: number;
}) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "company";
  const [tab, setTab] = useState<Tab>(initialTab);

  const tabs: { key: Tab; label: string; badge: number }[] = [
    { key: "company", label: "Company Chat", badge: companyUnreadCount },
    { key: "dm", label: "Direct Messages", badge: dmUnreadCount },
    { key: "announcements", label: "Announcements", badge: announcementUnreadCount },
  ];

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] sm:h-[calc(100vh-160px)]">
      <div className="flex border-b border-[var(--color-border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-[13px] font-semibold transition ${
              tab === t.key
                ? "border-b-2 border-[var(--crm-accent,#3e7ef7)] text-[var(--crm-accent,#3e7ef7)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10.5px] font-semibold text-white">
                {t.badge > 9 ? "9+" : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "company" && (
          <CompanyChatPanel identity={identity} initialMessages={companyMessages} highlightId={searchParams.get("highlight") ?? undefined} />
        )}
        {tab === "dm" && (
          <DirectMessagesPanel identity={identity} initialConversations={conversations} initialConversationId={searchParams.get("conversation") ?? undefined} />
        )}
        {tab === "announcements" && (
          <AnnouncementsPanel identity={identity} initialAnnouncements={announcements} highlightId={searchParams.get("highlight") ?? undefined} />
        )}
      </div>
    </div>
  );
}

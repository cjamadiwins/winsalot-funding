"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ActiveEmployeeOption, AnnouncementRow, CompanyMessageRow, DmConversationSummary } from "@/lib/chat-types";
import CompanyChatPanel from "./CompanyChatPanel";
import DirectMessagesPanel from "./DirectMessagesPanel";
import AnnouncementsPanel from "./AnnouncementsPanel";

type Tab = "company" | "dm" | "announcements";
type ActionResult = { error?: string };

// Every table name, Realtime/Presence channel name, and Server Action
// this page needs, bound to exactly one CRM by whichever page.tsx passes
// it in (src/app/agent/(dashboard)/chat/page.tsx and its three
// counterparts) - this component itself has no notion of which CRM it's
// rendering for, so it can't accidentally mix the two.
export type ChatScopeConfig = {
  companyMessagesTable: string;
  companyRealtimeChannel: string;
  dmMessagesTable: string;
  presenceChannel: string;
  announcementsTable: string;
  announcementsRealtimeChannel: string;
  sendCompanyMessage: (content: string) => Promise<ActionResult>;
  editCompanyMessage: (id: string, content: string) => Promise<ActionResult>;
  deleteCompanyMessage: (id: string) => Promise<ActionResult>;
  markCompanyChatRead: () => Promise<ActionResult>;
  searchActiveEmployees: (query: string) => Promise<{ error?: string; results?: ActiveEmployeeOption[] }>;
  getOrCreateDmConversation: (otherUserId: string) => Promise<{ error?: string; conversationId?: string }>;
  sendDmMessage: (conversationId: string, content: string) => Promise<ActionResult>;
  editDmMessage: (id: string, content: string) => Promise<ActionResult>;
  deleteDmMessage: (id: string) => Promise<ActionResult>;
  markDmConversationRead: (conversationId: string) => Promise<ActionResult>;
  sendAnnouncement: (content: string) => Promise<ActionResult>;
  toggleAnnouncementPin: (id: string, pinned: boolean) => Promise<ActionResult>;
  deleteAnnouncement: (id: string) => Promise<ActionResult>;
  markAnnouncementRead: (id: string) => Promise<ActionResult>;
};

export default function ChatPageClient({
  identity,
  companyMessages,
  companyUnreadCount,
  conversations,
  dmUnreadCount,
  announcements,
  announcementUnreadCount,
  scope,
}: {
  identity: { id: string; isAdmin: boolean };
  companyMessages: CompanyMessageRow[];
  companyUnreadCount: number;
  conversations: DmConversationSummary[];
  dmUnreadCount: number;
  announcements: AnnouncementRow[];
  announcementUnreadCount: number;
  scope: ChatScopeConfig;
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
          <CompanyChatPanel
            identity={identity}
            initialMessages={companyMessages}
            highlightId={searchParams.get("highlight") ?? undefined}
            tableName={scope.companyMessagesTable}
            realtimeChannel={scope.companyRealtimeChannel}
            sendMessage={scope.sendCompanyMessage}
            editMessage={scope.editCompanyMessage}
            deleteMessage={scope.deleteCompanyMessage}
            markRead={scope.markCompanyChatRead}
          />
        )}
        {tab === "dm" && (
          <DirectMessagesPanel
            identity={identity}
            initialConversations={conversations}
            initialConversationId={searchParams.get("conversation") ?? undefined}
            messagesTable={scope.dmMessagesTable}
            presenceChannel={scope.presenceChannel}
            searchActiveEmployees={scope.searchActiveEmployees}
            getOrCreateConversation={scope.getOrCreateDmConversation}
            sendMessage={scope.sendDmMessage}
            editMessage={scope.editDmMessage}
            deleteMessage={scope.deleteDmMessage}
            markConversationRead={scope.markDmConversationRead}
          />
        )}
        {tab === "announcements" && (
          <AnnouncementsPanel
            identity={identity}
            initialAnnouncements={announcements}
            highlightId={searchParams.get("highlight") ?? undefined}
            tableName={scope.announcementsTable}
            realtimeChannel={scope.announcementsRealtimeChannel}
            sendAnnouncement={scope.sendAnnouncement}
            togglePin={scope.toggleAnnouncementPin}
            deleteAnnouncement={scope.deleteAnnouncement}
            markRead={scope.markAnnouncementRead}
          />
        )}
      </div>
    </div>
  );
}

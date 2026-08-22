import { Suspense } from "react";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadLeadgenChatPageData } from "@/lib/leadgen-chat-data";
import {
  sendLeadgenCompanyMessageAction,
  deleteLeadgenCompanyMessageAction,
  markLeadgenCompanyChatReadAction,
  searchLeadgenActiveEmployeesAction,
  getOrCreateLeadgenDmConversationAction,
  sendLeadgenDmMessageAction,
  deleteLeadgenDmMessageAction,
  markLeadgenDmConversationReadAction,
  sendLeadgenAnnouncementAction,
  toggleLeadgenAnnouncementPinAction,
  deleteLeadgenAnnouncementAction,
  markLeadgenAnnouncementReadAction,
} from "@/lib/leadgen-chat-actions";
import ChatPageClient, { type ChatScopeConfig } from "@/components/chat/ChatPageClient";

// Lead Generation CRM only - never reads/writes crm_users or any crm_*
// table. See src/app/agent/(dashboard)/chat/page.tsx for the Cleaning
// CRM's own, fully separate copy of this page.
const scope: ChatScopeConfig = {
  companyMessagesTable: "leadgen_company_messages",
  companyRealtimeChannel: "leadgen-company-messages",
  dmMessagesTable: "leadgen_dm_messages",
  presenceChannel: "leadgen-chat-presence",
  announcementsTable: "leadgen_announcements",
  announcementsRealtimeChannel: "leadgen-announcements",
  sendCompanyMessage: sendLeadgenCompanyMessageAction,
  deleteCompanyMessage: deleteLeadgenCompanyMessageAction,
  markCompanyChatRead: markLeadgenCompanyChatReadAction,
  searchActiveEmployees: searchLeadgenActiveEmployeesAction,
  getOrCreateDmConversation: getOrCreateLeadgenDmConversationAction,
  sendDmMessage: sendLeadgenDmMessageAction,
  deleteDmMessage: deleteLeadgenDmMessageAction,
  markDmConversationRead: markLeadgenDmConversationReadAction,
  sendAnnouncement: sendLeadgenAnnouncementAction,
  toggleAnnouncementPin: toggleLeadgenAnnouncementPinAction,
  deleteAnnouncement: deleteLeadgenAnnouncementAction,
  markAnnouncementRead: markLeadgenAnnouncementReadAction,
};

export default async function LeadgenAgentChatPage() {
  const leadgenUser = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const identity = { id: leadgenUser.id, isAdmin: leadgenUser.role === "admin" };

  const data = await loadLeadgenChatPageData(supabase, identity);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
      <p className="mt-1 text-sm text-slate-500">Company Chat, Direct Messages, and Admin Announcements for the Lead Generation CRM.</p>
      <div className="mt-6">
        <Suspense>
          <ChatPageClient
            identity={identity}
            companyMessages={data.companyMessages}
            companyUnreadCount={data.companyUnreadCount}
            conversations={data.conversations}
            dmUnreadCount={data.dmUnreadCount}
            announcements={data.announcements}
            announcementUnreadCount={data.announcementUnreadCount}
            scope={scope}
          />
        </Suspense>
      </div>
    </div>
  );
}

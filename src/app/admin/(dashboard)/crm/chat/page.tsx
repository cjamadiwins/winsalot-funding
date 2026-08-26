import { Suspense } from "react";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadCrmChatPageData } from "@/lib/crm-chat-data";
import {
  sendCrmCompanyMessageAction,
  editCrmCompanyMessageAction,
  deleteCrmCompanyMessageAction,
  markCrmCompanyChatReadAction,
  searchCrmActiveEmployeesAction,
  getOrCreateCrmDmConversationAction,
  sendCrmDmMessageAction,
  editCrmDmMessageAction,
  deleteCrmDmMessageAction,
  markCrmDmConversationReadAction,
  sendCrmAnnouncementAction,
  toggleCrmAnnouncementPinAction,
  deleteCrmAnnouncementAction,
  markCrmAnnouncementReadAction,
} from "@/lib/crm-chat-actions";
import ChatPageClient, { type ChatScopeConfig } from "@/components/chat/ChatPageClient";

// Winsalot Growth CRM only - never reads/writes leadgen_users or any leadgen_*
// table. See src/app/leadgen/admin/(dashboard)/chat/page.tsx for the
// Lead Gen CRM's own, fully separate copy of this page.
const scope: ChatScopeConfig = {
  companyMessagesTable: "crm_company_messages",
  companyRealtimeChannel: "crm-company-messages",
  dmMessagesTable: "crm_dm_messages",
  presenceChannel: "crm-chat-presence",
  announcementsTable: "crm_announcements",
  announcementsRealtimeChannel: "crm-announcements",
  sendCompanyMessage: sendCrmCompanyMessageAction,
  editCompanyMessage: editCrmCompanyMessageAction,
  deleteCompanyMessage: deleteCrmCompanyMessageAction,
  markCompanyChatRead: markCrmCompanyChatReadAction,
  searchActiveEmployees: searchCrmActiveEmployeesAction,
  getOrCreateDmConversation: getOrCreateCrmDmConversationAction,
  sendDmMessage: sendCrmDmMessageAction,
  editDmMessage: editCrmDmMessageAction,
  deleteDmMessage: deleteCrmDmMessageAction,
  markDmConversationRead: markCrmDmConversationReadAction,
  sendAnnouncement: sendCrmAnnouncementAction,
  toggleAnnouncementPin: toggleCrmAnnouncementPinAction,
  deleteAnnouncement: deleteCrmAnnouncementAction,
  markAnnouncementRead: markCrmAnnouncementReadAction,
};

export default async function AdminChatPage() {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const identity = { id: crmUser.id, isAdmin: true };

  const data = await loadCrmChatPageData(supabase, identity);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
      <p className="mt-1 text-sm text-slate-500">Company Chat, Direct Messages, and Admin Announcements for the Winsalot Growth CRM.</p>
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

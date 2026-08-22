import { Suspense } from "react";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadChatPageData } from "@/lib/chat-data";
import ChatPageClient from "@/components/chat/ChatPageClient";

export default async function LeadgenAdminChatPage() {
  const leadgenUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();
  const identity = { id: leadgenUser.id, isAdmin: true };

  const data = await loadChatPageData(supabase, identity);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
      <p className="mt-1 text-sm text-slate-500">Company Chat, Direct Messages, and Admin Announcements - shared across both CRMs.</p>
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
          />
        </Suspense>
      </div>
    </div>
  );
}

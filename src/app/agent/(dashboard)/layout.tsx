import type { ReactNode } from "react";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import NotificationRefresher from "@/components/crm-ui/NotificationRefresher";
import type { CrmNotificationRow } from "@/lib/crm-notifications";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import { loadCrmChatUnreadCount } from "@/lib/crm-chat-data";
import {
  LayoutDashboard,
  Mail,
  GraduationCap,
  CalendarDays,
  CalendarOff,
  MessageSquare,
  BarChart3,
  TrendingUp,
  Wallet,
  CalendarClock,
  Building2,
  BookOpenCheck,
  PhoneCall,
} from "lucide-react";
import {
  agentSignOutAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

const NAV_ITEMS: CrmNavItem[] = [
  { label: "Dashboard", href: "/agent/dashboard", icon: <LayoutDashboard /> },
  { label: "Appointments", href: "/agent/appointments", icon: <CalendarClock /> },
  { label: "My Clients", href: "/agent/clients", icon: <Building2 /> },
  { label: "Email Tracking", href: "/agent/emails", icon: <Mail /> },
  { label: "Sales Training & Call Scripts", href: "/agent/training", icon: <GraduationCap /> },
  { label: "Winsalot Training", href: "/agent/winsalot-training", icon: <BookOpenCheck /> },
  { label: "My Attendance", href: "/agent/my-attendance", icon: <CalendarDays /> },
  { label: "Leave Requests", href: "/agent/leave-requests", icon: <CalendarOff /> },
  { label: "Chat", href: "/agent/chat", icon: <MessageSquare /> },
  { label: "Performance", href: "/agent/performance", icon: <BarChart3 /> },
  { label: "Monthly Performance", href: "/agent/performance/monthly", icon: <TrendingUp /> },
  { label: "Dialpad Performance", href: "/agent/dialpad", icon: <PhoneCall /> },
  { label: "My Pay", href: "/agent/pay", icon: <Wallet /> },
];

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const crmUser = await requireCrmUser();

  const supabase = await createSupabaseServerClient();
  const [{ data: notifications }, chatUnreadCount] = await Promise.all([
    supabase.from("crm_notifications").select("*").order("created_at", { ascending: false }).limit(20),
    loadCrmChatUnreadCount(supabase, crmUser.id),
  ]);

  const navItems: CrmNavItem[] = NAV_ITEMS.map((item) =>
    item.href === "/agent/chat" ? { ...item, badgeCount: chatUnreadCount } : item
  );

  const timeZonePreferences = await getUserTimeZonePreferences();

  return (
    <div className="crm-theme crm-theme--cleaning">
      <CrmShell
        brandTitle="Winsalot Growth CRM"
        brandSubtitle={
          <>
            Empowering Businesses,
            <br />
            One Solution at a Time.
          </>
        }
        brandLogoSrc="/winsalot-logo.png"
        homeHref="/agent/dashboard"
        navItems={navItems}
        userLabel={crmUser.full_name || crmUser.email}
        signOutAction={agentSignOutAction}
        clientLocalTime={{
          initialPreferences: timeZonePreferences,
          saveLocationsAction: saveUserTimeZonePreferences,
          resetLocationsAction: resetUserTimeZonePreferences,
          cardVariant: "photoHero",
        }}
        rightSlot={
          <>
            <NotificationRefresher />
            <NotificationBell
              notifications={(notifications ?? []) as CrmNotificationRow[]}
              markReadAction={markNotificationReadAction}
              markAllReadAction={markAllNotificationsReadAction}
            />
          </>
        }
      >
        {children}
      </CrmShell>
    </div>
  );
}

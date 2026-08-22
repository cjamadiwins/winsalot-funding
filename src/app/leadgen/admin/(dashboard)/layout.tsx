import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import NotificationRefresher from "@/components/crm-ui/NotificationRefresher";
import type { LeadgenNotificationRow } from "@/lib/leadgen-notifications";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import { loadLeadgenChatUnreadCount } from "@/lib/leadgen-chat-data";
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarCheck,
  BarChart3,
  Clock,
  CalendarOff,
  MessageSquare,
  Mail,
  UserCog,
  Wallet,
  FileText,
  GraduationCap,
  Gift,
} from "lucide-react";
import { signOutLeadgenAction, markNotificationReadAction, markAllNotificationsReadAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

const NAV_ITEMS: CrmNavItem[] = [
  { label: "Dashboard", href: "/leadgen/admin", icon: <LayoutDashboard /> },
  { label: "Clients", href: "/leadgen/admin/clients", icon: <Building2 /> },
  { label: "Leads", href: "/leadgen/admin/leads", icon: <Users /> },
  { label: "Appointments", href: "/leadgen/admin/appointments", icon: <CalendarCheck /> },
  { label: "Performance", href: "/leadgen/admin/performance", icon: <BarChart3 /> },
  { label: "Incentives", href: "/leadgen/admin/incentives", icon: <Gift /> },
  { label: "Attendance", href: "/leadgen/admin/attendance", icon: <Clock /> },
  { label: "Leave Requests", href: "/leadgen/admin/leave-requests", icon: <CalendarOff /> },
  { label: "Chat", href: "/leadgen/admin/chat", icon: <MessageSquare /> },
  { label: "Email Tracking", href: "/leadgen/admin/emails", icon: <Mail /> },
  { label: "Agents", href: "/leadgen/admin/agents", icon: <UserCog /> },
  { label: "Payroll", href: "/leadgen/admin/payroll", icon: <Wallet /> },
  { label: "Templates", href: "/leadgen/admin/templates", icon: <FileText /> },
  { label: "Training", href: "/leadgen/admin/training", icon: <GraduationCap /> },
];

export default async function LeadgenAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();
  const [{ data: notifications }, { count: pendingLeaveCount }, chatUnreadCount] = await Promise.all([
    supabase.from("leadgen_notifications").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("leadgen_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    loadLeadgenChatUnreadCount(supabase, user.id),
  ]);

  // Stays visible until every pending request has been approved or
  // declined - "Keep the Leave Requests navigation badge visible until
  // all pending requests have been reviewed."
  const navItems: CrmNavItem[] = NAV_ITEMS.map((item) => {
    if (item.href === "/leadgen/admin/leave-requests") return { ...item, badgeCount: pendingLeaveCount ?? 0 };
    if (item.href === "/leadgen/admin/chat") return { ...item, badgeCount: chatUnreadCount };
    return item;
  });

  const timeZonePreferences = await getUserTimeZonePreferences();

  return (
    <div className="crm-theme crm-theme--leadgen">
      <CrmShell
        brandTitle="Lead Generation CRM"
        brandSubtitle={
          <>
            Empowering Businesses,
            <br />
            One Solution at a Time.
          </>
        }
        brandLogoSrc="/winsalot-logo.png"
        homeHref="/leadgen/admin"
        navItems={navItems}
        userLabel={user.email}
        signOutAction={signOutLeadgenAction}
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
              notifications={(notifications ?? []) as LeadgenNotificationRow[]}
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

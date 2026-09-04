import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import NotificationRefresher from "@/components/crm-ui/NotificationRefresher";
import type { CrmNotificationRow } from "@/lib/crm-notifications";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import { loadCrmChatUnreadCount } from "@/lib/crm-chat-data";
import {
  LayoutDashboard,
  UserCog,
  Wallet,
  BarChart3,
  Clock,
  CalendarOff,
  MessageSquare,
  GraduationCap,
  Mail,
  Gift,
  CalendarClock,
  CalendarCog,
  Building2,
  Receipt,
  FileSignature,
  ClipboardList,
  Workflow,
  BookOpenCheck,
  PhoneCall,
  Target,
  Megaphone,
} from "lucide-react";
import { signOutAction, markNotificationReadAction, markAllNotificationsReadAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

const NAV_ITEMS: CrmNavItem[] = [
  { label: "CRM", href: "/admin/crm", icon: <LayoutDashboard /> },
  { label: "Opportunity Finder", href: "/admin/crm/opportunity-finder", icon: <Target /> },
  { label: "Appointments", href: "/admin/crm/appointments", icon: <CalendarClock /> },
  { label: "Consultation Availability", href: "/admin/crm/consultation-availability", icon: <CalendarCog /> },
  { label: "Agents", href: "/admin/crm/agents", icon: <UserCog /> },
  { label: "Clients", href: "/admin/crm/clients", icon: <Building2 /> },
  { label: "Email Marketing", href: "/admin/crm/marketing", icon: <Megaphone /> },
  { label: "Invoices", href: "/admin/crm/invoices", icon: <Receipt /> },
  { label: "Client Onboarding", href: "/admin/crm/onboarding", icon: <Workflow /> },
  { label: "Client Agreements", href: "/admin/crm/agreements", icon: <FileSignature /> },
  { label: "Client Intake", href: "/admin/crm/intake", icon: <ClipboardList /> },
  { label: "Payroll", href: "/admin/crm/payroll", icon: <Wallet /> },
  { label: "Performance", href: "/admin/crm/performance", icon: <BarChart3 /> },
  { label: "Call Logs", href: "/admin/crm/performance/call-notes", icon: <PhoneCall /> },
  { label: "Dialpad Performance", href: "/admin/crm/dialpad", icon: <PhoneCall /> },
  { label: "Incentives", href: "/admin/crm/incentives", icon: <Gift /> },
  { label: "Attendance", href: "/admin/crm/attendance", icon: <Clock /> },
  { label: "Leave Requests", href: "/admin/crm/leave-requests", icon: <CalendarOff /> },
  { label: "Chat", href: "/admin/crm/chat", icon: <MessageSquare /> },
  { label: "Training", href: "/admin/crm/training", icon: <GraduationCap /> },
  { label: "Winsalot Training", href: "/admin/crm/winsalot-training", icon: <BookOpenCheck /> },
  { label: "Email Tracking", href: "/admin/crm/emails", icon: <Mail /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminUser();

  // Best-effort: this admin may not have a crm_users row (e.g. an /admin
  // account that predates the CRM) - requireCrmAdmin() inside the
  // notification actions handles that gate; here we just render an empty
  // bell rather than blocking the whole dashboard on it.
  const supabase = await createSupabaseServerClient();
  const [{ data: notifications }, { count: pendingLeaveCount }, chatUnreadCount, { count: unreadAgreementCount }, { count: unreadIntakeCount }] = await Promise.all([
    supabase.from("crm_notifications").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("crm_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    loadCrmChatUnreadCount(supabase, user.id),
    // Item 9: badge stays visible until the admin has read the
    // notification for that signed agreement / intake submission -
    // reuses the same crm_notifications rows the bell already shows,
    // never a separate "reviewed" flag that could drift out of sync.
    supabase.from("crm_notifications").select("id", { count: "exact", head: true }).eq("is_read", false).ilike("link_path", "/admin/crm/agreements%"),
    supabase.from("crm_notifications").select("id", { count: "exact", head: true }).eq("is_read", false).ilike("link_path", "/admin/crm/intake%"),
  ]);

  // Stays visible until every pending request has been approved or
  // declined - "Keep the Leave Requests navigation badge visible until
  // all pending requests have been reviewed."
  const navItems: CrmNavItem[] = NAV_ITEMS.map((item) => {
    if (item.href === "/admin/crm/leave-requests") return { ...item, badgeCount: pendingLeaveCount ?? 0 };
    if (item.href === "/admin/crm/chat") return { ...item, badgeCount: chatUnreadCount };
    if (item.href === "/admin/crm/agreements") return { ...item, badgeCount: unreadAgreementCount ?? 0 };
    if (item.href === "/admin/crm/intake") return { ...item, badgeCount: unreadIntakeCount ?? 0 };
    return item;
  });

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
        homeHref="/admin/crm"
        navItems={navItems}
        userLabel={user.email}
        signOutAction={signOutAction}
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

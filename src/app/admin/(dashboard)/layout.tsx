import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import NotificationRefresher from "@/components/crm-ui/NotificationRefresher";
import type { CrmNotificationRow } from "@/lib/crm-notifications";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import {
  ClipboardList,
  HardHat,
  Receipt,
  LayoutDashboard,
  ClipboardCheck,
  UserCog,
  Wallet,
  BarChart3,
  Clock,
  CalendarOff,
  Search,
  UserPlus,
  GraduationCap,
  Mail,
  Gift,
} from "lucide-react";
import { signOutAction, markNotificationReadAction, markAllNotificationsReadAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

const NAV_ITEMS: CrmNavItem[] = [
  { label: "Requests", href: "/admin", icon: <ClipboardList /> },
  { label: "Providers", href: "/admin/providers", icon: <HardHat /> },
  { label: "Invoices", href: "/admin/invoices", icon: <Receipt /> },
  { label: "CRM", href: "/admin/crm", icon: <LayoutDashboard /> },
  { label: "Quote Fulfillment", href: "/admin/crm/leads", icon: <ClipboardCheck /> },
  { label: "Agents", href: "/admin/crm/agents", icon: <UserCog /> },
  { label: "Payroll", href: "/admin/crm/payroll", icon: <Wallet /> },
  { label: "Performance", href: "/admin/crm/performance", icon: <BarChart3 /> },
  { label: "Incentives", href: "/admin/crm/incentives", icon: <Gift /> },
  { label: "Attendance", href: "/admin/crm/attendance", icon: <Clock /> },
  { label: "Leave Requests", href: "/admin/crm/leave-requests", icon: <CalendarOff /> },
  { label: "Cleaning Opportunities", href: "/admin/crm/opportunities", icon: <Search /> },
  { label: "Provider Acquisition", href: "/admin/crm/provider-acquisition", icon: <UserPlus /> },
  { label: "Training", href: "/admin/crm/training", icon: <GraduationCap /> },
  { label: "Email Tracking", href: "/admin/crm/emails", icon: <Mail /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminUser();

  // Best-effort: this admin may not have a crm_users row (e.g. an /admin
  // account that predates the CRM) - requireCrmAdmin() inside the
  // notification actions handles that gate; here we just render an empty
  // bell rather than blocking the whole dashboard on it.
  const supabase = await createSupabaseServerClient();
  const [{ data: notifications }, { count: pendingLeaveCount }] = await Promise.all([
    supabase.from("crm_notifications").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("crm_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  // Stays visible until every pending request has been approved or
  // declined - "Keep the Leave Requests navigation badge visible until
  // all pending requests have been reviewed."
  const navItems: CrmNavItem[] = NAV_ITEMS.map((item) =>
    item.href === "/admin/crm/leave-requests" ? { ...item, badgeCount: pendingLeaveCount ?? 0 } : item
  );

  const timeZonePreferences = await getUserTimeZonePreferences();

  return (
    <div className="crm-theme crm-theme--cleaning">
      <CrmShell
        brandTitle="Cleaning CRM"
        brandSubtitle={
          <>
            Empowering Businesses,
            <br />
            One Solution at a Time.
          </>
        }
        brandLogoSrc="/winsalot-logo.png"
        homeHref="/admin"
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

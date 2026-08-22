import type { ReactNode } from "react";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import type { CrmNotificationRow } from "@/lib/crm-notifications";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import {
  LayoutDashboard,
  Search,
  UserPlus,
  HardHat,
  Mail,
  GraduationCap,
  Clock,
  CalendarDays,
  CalendarOff,
  BarChart3,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  agentSignOutAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

const NAV_ITEMS: CrmNavItem[] = [
  { label: "Dashboard", href: "/agent/dashboard", icon: <LayoutDashboard /> },
  { label: "Cleaning Opportunities", href: "/agent/opportunities", icon: <Search /> },
  { label: "Provider Acquisition", href: "/agent/provider-acquisition", icon: <UserPlus /> },
  { label: "Providers", href: "/agent/providers", icon: <HardHat /> },
  { label: "Email Tracking", href: "/agent/emails", icon: <Mail /> },
  { label: "Sales Training & Call Scripts", href: "/agent/training", icon: <GraduationCap /> },
  { label: "Attendance", href: "/agent/attendance", icon: <Clock /> },
  { label: "My Attendance", href: "/agent/my-attendance", icon: <CalendarDays /> },
  { label: "Leave Requests", href: "/agent/leave-requests", icon: <CalendarOff /> },
  { label: "Performance", href: "/agent/performance", icon: <BarChart3 /> },
  { label: "Monthly Performance", href: "/agent/performance/monthly", icon: <TrendingUp /> },
  { label: "My Pay", href: "/agent/pay", icon: <Wallet /> },
];

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const crmUser = await requireCrmUser();

  const supabase = await createSupabaseServerClient();
  const { data: notifications } = await supabase
    .from("crm_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

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
        homeHref="/agent/dashboard"
        navItems={NAV_ITEMS}
        userLabel={crmUser.full_name || crmUser.email}
        signOutAction={agentSignOutAction}
        clientLocalTime={{
          initialPreferences: timeZonePreferences,
          saveLocationsAction: saveUserTimeZonePreferences,
          resetLocationsAction: resetUserTimeZonePreferences,
          cardVariant: "photoHero",
        }}
        rightSlot={
          <NotificationBell
            notifications={(notifications ?? []) as CrmNotificationRow[]}
            markReadAction={markNotificationReadAction}
            markAllReadAction={markAllNotificationsReadAction}
          />
        }
      >
        {children}
      </CrmShell>
    </div>
  );
}

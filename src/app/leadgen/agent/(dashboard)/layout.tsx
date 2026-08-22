import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import NotificationRefresher from "@/components/crm-ui/NotificationRefresher";
import type { LeadgenNotificationRow } from "@/lib/leadgen-notifications";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Mail,
  BarChart3,
  TrendingUp,
  GraduationCap,
  Wallet,
} from "lucide-react";
import { signOutLeadgenAgentAction, markNotificationReadAction, markAllNotificationsReadAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

const NAV_ITEMS: CrmNavItem[] = [
  { label: "Dashboard", href: "/leadgen/agent", icon: <LayoutDashboard /> },
  { label: "My Leads", href: "/leadgen/agent/leads", icon: <Users /> },
  { label: "Add Lead", href: "/leadgen/agent/leads/new", icon: <UserPlus /> },
  { label: "My Appointments", href: "/leadgen/agent/appointments", icon: <CalendarCheck /> },
  { label: "My Attendance", href: "/leadgen/agent/my-attendance", icon: <CalendarDays /> },
  { label: "Leave Requests", href: "/leadgen/agent/leave-requests", icon: <CalendarOff /> },
  { label: "Email Tracking", href: "/leadgen/agent/emails", icon: <Mail /> },
  { label: "My Performance", href: "/leadgen/agent/performance", icon: <BarChart3 /> },
  { label: "Monthly Performance", href: "/leadgen/agent/performance/monthly", icon: <TrendingUp /> },
  { label: "Training", href: "/leadgen/agent/training", icon: <GraduationCap /> },
  { label: "My Pay", href: "/leadgen/agent/pay", icon: <Wallet /> },
];

export default async function LeadgenAgentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { data: notifications } = await supabase
    .from("leadgen_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
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
        homeHref="/leadgen/agent"
        navItems={NAV_ITEMS}
        userLabel={user.full_name}
        signOutAction={signOutLeadgenAgentAction}
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

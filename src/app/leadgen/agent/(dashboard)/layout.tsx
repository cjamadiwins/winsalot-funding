import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarCheck,
  CalendarDays,
  Mail,
  BarChart3,
  TrendingUp,
  GraduationCap,
  Wallet,
} from "lucide-react";
import { signOutLeadgenAgentAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

const NAV_ITEMS: CrmNavItem[] = [
  { label: "Dashboard", href: "/leadgen/agent", icon: <LayoutDashboard /> },
  { label: "My Leads", href: "/leadgen/agent/leads", icon: <Users /> },
  { label: "Add Lead", href: "/leadgen/agent/leads/new", icon: <UserPlus /> },
  { label: "My Appointments", href: "/leadgen/agent/appointments", icon: <CalendarCheck /> },
  { label: "My Attendance", href: "/leadgen/agent/my-attendance", icon: <CalendarDays /> },
  { label: "Email Tracking", href: "/leadgen/agent/emails", icon: <Mail /> },
  { label: "My Performance", href: "/leadgen/agent/performance", icon: <BarChart3 /> },
  { label: "Monthly Performance", href: "/leadgen/agent/performance/monthly", icon: <TrendingUp /> },
  { label: "Training", href: "/leadgen/agent/training", icon: <GraduationCap /> },
  { label: "My Pay", href: "/leadgen/agent/pay", icon: <Wallet /> },
];

export default async function LeadgenAgentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLeadgenAgent();
  const timeZonePreferences = await getUserTimeZonePreferences();

  return (
    <div className="crm-theme">
      <CrmShell
        brandTitle="Winsalot Corp. Lead Gen CRM"
        brandSubtitle="Empowering Businesses. One Solution at a Time."
        homeHref="/leadgen/agent"
        navItems={NAV_ITEMS}
        userLabel={user.full_name}
        signOutAction={signOutLeadgenAgentAction}
        clientLocalTime={{
          initialPreferences: timeZonePreferences,
          saveLocationsAction: saveUserTimeZonePreferences,
          resetLocationsAction: resetUserTimeZonePreferences,
        }}
      >
        {children}
      </CrmShell>
    </div>
  );
}

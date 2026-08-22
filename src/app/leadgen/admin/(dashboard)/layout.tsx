import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarCheck,
  BarChart3,
  Clock,
  CalendarOff,
  Mail,
  UserCog,
  Wallet,
  FileText,
  GraduationCap,
  Gift,
} from "lucide-react";
import { signOutLeadgenAction } from "./actions";
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
  { label: "Email Tracking", href: "/leadgen/admin/emails", icon: <Mail /> },
  { label: "Agents", href: "/leadgen/admin/agents", icon: <UserCog /> },
  { label: "Payroll", href: "/leadgen/admin/payroll", icon: <Wallet /> },
  { label: "Templates", href: "/leadgen/admin/templates", icon: <FileText /> },
  { label: "Training", href: "/leadgen/admin/training", icon: <GraduationCap /> },
];

export default async function LeadgenAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLeadgenAdmin();
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
        navItems={NAV_ITEMS}
        userLabel={user.email}
        signOutAction={signOutLeadgenAction}
        clientLocalTime={{
          initialPreferences: timeZonePreferences,
          saveLocationsAction: saveUserTimeZonePreferences,
          resetLocationsAction: resetUserTimeZonePreferences,
          cardVariant: "photoHero",
        }}
      >
        {children}
      </CrmShell>
    </div>
  );
}

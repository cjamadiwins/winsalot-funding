import { LayoutDashboard, Users, CalendarCheck, BarChart3, MessageSquare, UserCircle } from "lucide-react";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import { signOutClientAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

// The canonical Client Portal shell (brief: Dashboard / My Leads /
// Appointments / Reports / Profile / Sign Out - Communications is kept
// too, since it's an existing, working feature and the brief only lists
// its *suggested* nav, not an exhaustive one). No Admin/Agent nav item
// ever appears here - this shell is only ever reached by a role='client'
// leadgen_users row (requireLeadgenPortalClient), and CrmShell itself has
// no awareness of the other CRMs' navigation at all.
export default async function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const { client } = await requireLeadgenPortalClient();

  const navItems: CrmNavItem[] = [
    { label: "Dashboard", href: "/client/dashboard", icon: <LayoutDashboard /> },
    { label: "My Leads", href: "/client/leads", icon: <Users /> },
    { label: "Appointments", href: "/client/appointments", icon: <CalendarCheck /> },
    { label: "Reports", href: "/client/reports", icon: <BarChart3 /> },
    { label: "Communications", href: "/client/communications", icon: <MessageSquare /> },
    { label: "Profile", href: "/client/profile", icon: <UserCircle /> },
  ];

  const timeZonePreferences = await getUserTimeZonePreferences();

  return (
    <div className="crm-theme">
      <CrmShell
        brandTitle={client.name}
        brandSubtitle="Winsalot Client Portal"
        homeHref="/client/dashboard"
        navItems={navItems}
        signOutAction={signOutClientAction}
        clientLocalTime={{
          initialPreferences: timeZonePreferences,
          saveLocationsAction: saveUserTimeZonePreferences,
          resetLocationsAction: resetUserTimeZonePreferences,
          // Brief: "The Client Portal should not reference Lagos or agent
          // locations." Every other dashboard (Growth CRM, Lead Gen CRM
          // admin/agent) omits this flag and keeps the comparison.
          hideNigeriaComparison: true,
        }}
      >
        {children}
      </CrmShell>
    </div>
  );
}

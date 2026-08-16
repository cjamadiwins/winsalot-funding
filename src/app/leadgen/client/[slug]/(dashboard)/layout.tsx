import { requireLeadgenClient } from "@/lib/leadgen-auth";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import { LayoutDashboard, CalendarCheck, MessageSquare } from "lucide-react";
import { signOutLeadgenClientAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

export default async function LeadgenClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { client } = await requireLeadgenClient(slug);

  const navItems: CrmNavItem[] = [
    { label: "Dashboard", href: `/leadgen/client/${slug}`, icon: <LayoutDashboard /> },
    { label: "Appointments", href: `/leadgen/client/${slug}/appointments`, icon: <CalendarCheck /> },
    { label: "Communications", href: `/leadgen/client/${slug}/communications`, icon: <MessageSquare /> },
  ];

  const timeZonePreferences = await getUserTimeZonePreferences();

  return (
    <div className="crm-theme">
      <CrmShell
        brandTitle={client.name}
        brandSubtitle="Winsalot Lead Gen CRM"
        homeHref={`/leadgen/client/${slug}`}
        navItems={navItems}
        signOutAction={signOutLeadgenClientAction}
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

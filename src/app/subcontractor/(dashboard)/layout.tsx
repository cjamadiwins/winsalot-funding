import type { ReactNode } from "react";
import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import { LayoutDashboard, FileSignature, GraduationCap, Wallet, PhoneCall } from "lucide-react";
import { subcontractorSignOutAction } from "./actions";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";

// Deliberately much smaller than the agent/admin shells (brief section N:
// "keep it simple") - no notifications, chat, or performance sections,
// since a subcontractor's portal only needs to cover their own onboarding,
// agreement, training, and pay.
export default async function SubcontractorLayout({ children }: { children: ReactNode }) {
  const crmUser = await requireCrmSubcontractor();
  const supabase = await createSupabaseServerClient();

  const { data: permissions } = await supabase
    .from("crm_subcontractor_permissions")
    .select("add_call_logs")
    .eq("subcontractor_id", crmUser.subcontractor_id)
    .maybeSingle();

  const navItems: CrmNavItem[] = [
    { label: "Dashboard", href: "/subcontractor/dashboard", icon: <LayoutDashboard /> },
    { label: "Agreement", href: "/subcontractor/agreement", icon: <FileSignature /> },
    { label: "Training", href: "/subcontractor/training", icon: <GraduationCap /> },
    ...(permissions?.add_call_logs ? [{ label: "Call Log", href: "/subcontractor/call-log", icon: <PhoneCall /> }] : []),
    { label: "My Pay", href: "/subcontractor/pay", icon: <Wallet /> },
  ];

  const timeZonePreferences = await getUserTimeZonePreferences();

  return (
    <div className="crm-theme crm-theme--cleaning">
      <CrmShell
        brandTitle="Winsalot Growth CRM"
        brandSubtitle="Subcontractor Portal"
        brandLogoSrc="/winsalot-logo.png"
        homeHref="/subcontractor/dashboard"
        navItems={navItems}
        userLabel={crmUser.full_name.trim() || "Subcontractor"}
        signOutAction={subcontractorSignOutAction}
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

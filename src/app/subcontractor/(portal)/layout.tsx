import { LayoutDashboard, FileSignature, PhoneCall, Wallet, UserCircle } from "lucide-react";
import CrmShell, { type CrmNavItem } from "@/components/crm-ui/CrmShell";
import { requireGrowthSubcontractor } from "@/lib/subcontractor-auth";
import { getUserTimeZonePreferences, saveUserTimeZonePreferences, resetUserTimeZonePreferences } from "@/lib/user-time-zone-preferences";
import { signOutSubcontractorAction } from "./actions";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const subcontractor = await requireGrowthSubcontractor();
  const nav: CrmNavItem[] = [
    { label: "Dashboard", href: "/subcontractor/dashboard", icon: <LayoutDashboard /> },
    { label: "Agreement", href: "/subcontractor/agreement", icon: <FileSignature /> },
    { label: "Call Log", href: "/subcontractor/call-log", icon: <PhoneCall /> },
    { label: "Payments", href: "/subcontractor/payments", icon: <Wallet /> },
    { label: "Profile", href: "/subcontractor/profile", icon: <UserCircle /> },
  ];
  return <div className="crm-theme"><CrmShell brandTitle="Winsalot Corp" brandSubtitle="Subcontractor Portal" homeHref="/subcontractor/dashboard" navItems={nav} userLabel={subcontractor.full_name} signOutAction={signOutSubcontractorAction} clientLocalTime={{ initialPreferences: await getUserTimeZonePreferences(), saveLocationsAction: saveUserTimeZonePreferences, resetLocationsAction: resetUserTimeZonePreferences }}>{children}</CrmShell></div>;
}

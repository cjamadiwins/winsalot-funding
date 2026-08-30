// Client Portal Access: small, framework-agnostic shared types/helpers for
// the Growth CRM's "CLIENT PORTAL ACCESS" management section (migration
// 0114). Deliberately its own file, not folded into crm-clients-types.ts
// or leadgen-types.ts - this concept sits *between* the two otherwise-
// independent CRMs (a Growth CRM crm_clients row's view of a Lead Gen CRM
// leadgen_users login), so it must never make either CRM's own type layer
// depend on the other's.
//
// Portal Status is deliberately never stored as its own column - it is
// always derived from whether a leadgen_users row exists for the linked
// client and that row's own `active` flag, the same flag that already
// gates real login (requireLeadgenUser in src/lib/leadgen-auth.ts). A
// separate stored status column could drift out of sync with the value
// that actually controls access; deriving it structurally can't.
export const PORTAL_STATUSES = ["not_created", "active", "disabled"] as const;
export type PortalStatus = (typeof PORTAL_STATUSES)[number];

export const PORTAL_STATUS_LABELS: Record<PortalStatus, string> = {
  not_created: "Not Created",
  active: "Active",
  disabled: "Disabled",
};

export const PORTAL_STATUS_STYLES: Record<PortalStatus, string> = {
  not_created: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-800",
  disabled: "bg-rose-100 text-rose-800",
};

export function derivePortalStatus(portalUser: { active: boolean } | null): PortalStatus {
  if (!portalUser) return "not_created";
  return portalUser.active ? "active" : "disabled";
}

export const CRM_CLIENT_PORTAL_ACTIVITY_ACTIONS = [
  "leadgen_client_linked",
  "portal_created",
  "portal_activated",
  "portal_disabled",
  "portal_reactivated",
  "invite_sent",
  "invite_resent",
  "access_reset",
] as const;

export type CrmClientPortalActivityAction = (typeof CRM_CLIENT_PORTAL_ACTIVITY_ACTIONS)[number];

export const CRM_CLIENT_PORTAL_ACTIVITY_LABELS: Record<CrmClientPortalActivityAction, string> = {
  leadgen_client_linked: "Linked to Lead Generation client",
  portal_created: "Portal created",
  portal_activated: "Portal activated",
  portal_disabled: "Portal disabled",
  portal_reactivated: "Portal reactivated",
  invite_sent: "Invite sent",
  invite_resent: "Invite resent",
  access_reset: "Access reset",
};

export type CrmClientPortalActivityRow = {
  id: string;
  created_at: string;
  client_id: string;
  action: CrmClientPortalActivityAction;
  performed_by: string | null;
  performed_by_name: string | null;
  detail: string | null;
};

// The one canonical place the Client Portal actually lives (brief: "MAIN
// CLIENT PORTAL LOCATION"). Used verbatim for the Growth CRM's "Open
// Client Portal" link - deliberately not built from getSiteUrl()/host
// detection, since that resolves to the Growth CRM's own domain, not the
// separate Lead Gen CRM deployment this points at.
export const CLIENT_PORTAL_URL = "https://leads.winsalotcorp.com/client";

// A minimal, portal-user-shaped view used by derivePortalStatus() and the
// Growth CRM's Client Portal Access panel - narrower than the full
// LeadgenUserRow so this file never needs to import leadgen-types.ts.
export type PortalLeadgenUserSummary = {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  invited_at: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
  last_login_at: string | null;
};

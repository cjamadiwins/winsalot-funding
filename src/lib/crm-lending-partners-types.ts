// Winsalot Growth CRM: Lending & Referral Partners (crm_lending_partners,
// migration 0158). The supply side of the Business Financing pipeline -
// lenders, brokers, and referral/reseller partners Winsalot places deals
// with - distinct from crm_opportunities, which is the demand side
// (businesses asking Winsalot for financing). See that migration's header
// comment for the full design rationale (admin-only RLS, the
// provider_leads precedent, etc).

export const LENDING_PARTNER_CONTACT_TYPES = ["lender_contact", "broker", "referral_partner"] as const;
export type LendingPartnerContactType = (typeof LENDING_PARTNER_CONTACT_TYPES)[number];

export const LENDING_PARTNER_CONTACT_TYPE_LABELS: Record<LendingPartnerContactType, string> = {
  lender_contact: "Lender Contact",
  broker: "Broker",
  referral_partner: "Partner / Referral Source",
};

export const LENDING_PARTNER_CONTACT_TYPE_STYLES: Record<LendingPartnerContactType, string> = {
  lender_contact: "bg-sky-100 text-sky-800",
  broker: "bg-purple-100 text-purple-800",
  referral_partner: "bg-amber-100 text-amber-800",
};

export function isLendingPartnerContactType(value: string): value is LendingPartnerContactType {
  return (LENDING_PARTNER_CONTACT_TYPES as readonly string[]).includes(value);
}

export type CrmLendingPartnerRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  assigned_agent_id: string | null;

  hubspot_record_id: string | null;

  company_name: string;
  contact_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;

  contact_type: LendingPartnerContactType;
  relationship_status: string | null;
  submission_email: string | null;
  commission_notes: string | null;

  notes: string | null;

  archived_at: string | null;
  archived_by: string | null;
};

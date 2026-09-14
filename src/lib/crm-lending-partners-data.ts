import "server-only";
import type { createSupabaseServerClient } from "./supabase-server";
import type { CrmLendingPartnerRow } from "./crm-lending-partners-types";
import type { CrmActivityRow } from "./crm-types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type LendingPartnerListFilters = {
  search?: string;
  contactType?: string;
  assignedAgentId?: string;
};

// Powers the admin Lending Partners list: search across company/contact/
// email/phone, plus a contact-type filter - same shape as
// fetchClientList (src/lib/crm-clients-data.ts) for this CRM's other
// admin-only registry.
export async function fetchLendingPartnerList(
  supabase: SupabaseClient,
  filters: LendingPartnerListFilters
): Promise<{ data: CrmLendingPartnerRow[]; error: string | null }> {
  let query = supabase.from("crm_lending_partners").select("*").order("company_name");
  if (filters.contactType) query = query.eq("contact_type", filters.contactType);
  if (filters.assignedAgentId) query = query.eq("assigned_agent_id", filters.assignedAgentId);
  if (filters.search) {
    const term = filters.search.trim();
    query = query.or(
      `company_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
    );
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CrmLendingPartnerRow[], error: null };
}

export type LendingPartnerDetail = {
  partner: CrmLendingPartnerRow;
  activities: CrmActivityRow[];
};

// Everything the partner-profile page needs: the record itself plus its
// full crm_activities timeline (imported HubSpot history today, any
// future call/note/outcome logged the same way as opportunities/clients).
export async function fetchLendingPartnerDetail(
  supabase: SupabaseClient,
  partnerId: string
): Promise<{ data: LendingPartnerDetail | null; error: string | null }> {
  const { data: partner, error: partnerError } = await supabase
    .from("crm_lending_partners")
    .select("*")
    .eq("id", partnerId)
    .maybeSingle();
  if (partnerError) return { data: null, error: partnerError.message };
  if (!partner) return { data: null, error: "Lending partner not found." };

  const { data: activities } = await supabase
    .from("crm_activities")
    .select("*")
    .eq("lending_partner_id", partnerId)
    .order("occurred_at", { ascending: false });

  return {
    data: {
      partner: partner as CrmLendingPartnerRow,
      activities: (activities ?? []) as CrmActivityRow[],
    },
    error: null,
  };
}

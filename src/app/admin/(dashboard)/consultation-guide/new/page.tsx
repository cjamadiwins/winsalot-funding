import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ConsultationGuideForm from "../ConsultationGuideForm";
import { createConsultationGuideAction, completeConsultationGuideAction } from "../actions";

// New Client Consultation Guide - "If a consultation is opened from an
// existing Growth CRM prospect/client, automatically populate available
// information such as business name, contact name, phone, email,
// industry, and location." Reached either directly ("+ New Consultation"
// on the index) or via ?opportunityId=<id> from an opportunity record's
// own "Consultation Guide" link.
export default async function NewConsultationGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const admin = await requireCrmAdmin();
  const { opportunityId } = await searchParams;

  let initial: Record<string, string | null> = { consultant_name: admin.full_name || admin.email };

  if (opportunityId) {
    const supabase = await createSupabaseServerClient();
    const { data: opportunity } = await supabase
      .from("crm_opportunities")
      .select("business_name, contact_name, phone, email, industry, city, province_state")
      .eq("id", opportunityId)
      .maybeSingle();

    if (opportunity) {
      initial = {
        ...initial,
        business_name: opportunity.business_name,
        contact_name: opportunity.contact_name,
        phone: opportunity.phone,
        email: opportunity.email,
        industry: opportunity.industry,
        location: [opportunity.city, opportunity.province_state].filter(Boolean).join(", ") || null,
      };
    }
  }

  return (
    <ConsultationGuideForm
      guide={null}
      opportunityId={opportunityId ?? null}
      initial={initial}
      saveAction={createConsultationGuideAction}
      completeAction={completeConsultationGuideAction.bind(null, null)}
      backHref="/admin/consultation-guide"
    />
  );
}

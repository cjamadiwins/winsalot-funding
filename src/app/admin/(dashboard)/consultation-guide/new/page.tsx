import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ConsultationGuideForm from "../ConsultationGuideForm";
import { createConsultationGuideAction, completeConsultationGuideAction } from "../actions";
import type { OpportunityType } from "@/lib/crm-types";
import type { ConsultationGuideService } from "@/lib/consultation-guide";

// Maps the appointment's own 3-way service_type onto the guide's 2-way
// Service field. "both_services" has no single correct answer here, so
// it's left unset (same as an appointment with no service at all) -
// Admin must choose explicitly before the consultation can be marked
// complete; it is never guessed from notes or other text.
function serviceFromAppointmentType(type: OpportunityType): ConsultationGuideService | null {
  return type === "lead_generation" || type === "business_financing" ? type : null;
}

// New Client Consultation Guide - "If a consultation is opened from an
// existing Growth CRM prospect/client, automatically populate available
// information such as business name, contact name, phone, email,
// industry, and location." Reached directly ("+ New Consultation" on the
// index, which shows the manual appointment-search fallback), via
// ?opportunityId=<id> from an opportunity record's own "Consultation
// Guide" link, or via ?appointmentId=<id> from the appointment page's own
// "Open Consultation Guide" action.
export default async function NewConsultationGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string; appointmentId?: string }>;
}) {
  const admin = await requireCrmAdmin();
  const { opportunityId, appointmentId } = await searchParams;

  let initial: Record<string, string | null> = { consultant_name: admin.full_name || admin.email };
  let initialService: ConsultationGuideService | null = null;
  let resolvedOpportunityId: string | null = opportunityId ?? null;
  let resolvedAppointmentId: string | null = null;
  let linkedAppointmentLabel: string | null = null;
  let appointmentNotFound = false;

  const supabase = await createSupabaseServerClient();

  if (appointmentId) {
    // requireCrmAdmin() already gates this whole page to admins, and this
    // read goes through the session client (RLS-checked, not the
    // service-role client) - an admin can see every appointment, so
    // there's nothing a tampered URL ID can expose beyond what the
    // Appointments page itself already shows. A nonexistent/deleted id
    // falls through to the manual-fallback UI below rather than crashing.
    const { data: appointment } = await supabase
      .from("winsalot_appointments")
      .select("*, crm_opportunities(business_name, industry, city, province_state)")
      .eq("id", appointmentId)
      .maybeSingle();

    if (!appointment) {
      appointmentNotFound = true;
    } else {
      const opportunity = appointment.crm_opportunities as
        | { business_name: string; industry: string | null; city: string | null; province_state: string | null }
        | null;

      let consultantName = admin.full_name || admin.email;
      if (appointment.assigned_agent_id) {
        const { data: agent } = await supabase
          .from("crm_users")
          .select("full_name, email")
          .eq("id", appointment.assigned_agent_id)
          .maybeSingle();
        if (agent) consultantName = agent.full_name || agent.email;
      }

      initial = {
        consultant_name: consultantName,
        business_name: appointment.business_name,
        contact_name: appointment.contact_name,
        phone: appointment.phone,
        email: appointment.email,
        industry: opportunity?.industry ?? null,
        location: opportunity ? [opportunity.city, opportunity.province_state].filter(Boolean).join(", ") || null : null,
      };
      initialService = serviceFromAppointmentType(appointment.service_type as OpportunityType);
      resolvedOpportunityId = appointment.opportunity_id;
      resolvedAppointmentId = appointment.id;
      linkedAppointmentLabel = `${appointment.business_name} — ${new Date(appointment.appointment_start_at).toLocaleString()}`;
    }
  } else if (opportunityId) {
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
      opportunityId={resolvedOpportunityId}
      appointmentId={resolvedAppointmentId}
      linkedAppointmentLabel={linkedAppointmentLabel}
      appointmentNotFound={appointmentNotFound}
      showAppointmentPicker={!appointmentId && !opportunityId}
      initial={initial}
      initialService={initialService}
      saveAction={createConsultationGuideAction}
      completeAction={completeConsultationGuideAction.bind(null, null)}
      backHref="/admin/consultation-guide"
    />
  );
}

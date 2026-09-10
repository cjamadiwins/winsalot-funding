import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmPerformanceConsultationBooking, CrmPerformanceOpportunityRecord } from "./crm-performance";

// Fetches every crm_opportunities row shaped for computeCrmAgentPerformance.
// Unlike the old quote-linked version, this reads crm_opportunities
// directly - no join to a separate fulfillment table, since
// proposal_sent_at/application_submitted_at/closed_at live on the
// opportunity itself. Consultation performance deliberately comes from
// winsalot_appointments instead: consultation_date is an optional planning
// field on the opportunity form and is not evidence of a real booking.
//
// Uses the service-role client so a single call can cover every agent for
// the admin's "every agent" view (/admin/crm/performance) without an
// extra round trip per agent. When agentId is supplied, the opportunity
// query includes both opportunities currently assigned to that agent and
// opportunities tied to one of their historical bookings. That preserves
// booking-time credit even if the opportunity is later reassigned while
// still excluding unrelated agents' records from the returned dataset.
export async function getCrmPerformanceRecords(agentId?: string): Promise<CrmPerformanceOpportunityRecord[]> {
  const admin = getSupabaseAdmin();

  const opportunityQuery = admin
    .from("crm_opportunities")
    .select(
      "id, business_name, assigned_agent_id, opportunity_type, stage, created_at, proposal_sent_at, application_submitted_at, closed_at"
    );
  const appointmentQuery = admin
    .from("winsalot_appointments")
    .select("id, opportunity_id, assigned_agent_id, created_at")
    .eq("status", "booked")
    .not("opportunity_id", "is", null);
  let opportunities;
  let appointments;
  if (agentId) {
    const appointmentResult = await appointmentQuery.eq("assigned_agent_id", agentId);
    appointments = appointmentResult.data;
    const bookedOpportunityIds = Array.from(
      new Set((appointments ?? []).map((appointment) => appointment.opportunity_id).filter((id): id is string => Boolean(id)))
    );
    const scope = [`assigned_agent_id.eq.${agentId}`];
    if (bookedOpportunityIds.length > 0) scope.push(`id.in.(${bookedOpportunityIds.join(",")})`);
    const opportunityResult = await opportunityQuery.or(scope.join(","));
    opportunities = opportunityResult.data;
  } else {
    const [opportunityResult, appointmentResult] = await Promise.all([opportunityQuery, appointmentQuery]);
    opportunities = opportunityResult.data;
    appointments = appointmentResult.data;
  }
  if (!opportunities || opportunities.length === 0) return [];

  const bookingsByOpportunity = new Map<string, CrmPerformanceConsultationBooking[]>();
  for (const appointment of appointments ?? []) {
    if (!appointment.opportunity_id) continue;
    const bookings = bookingsByOpportunity.get(appointment.opportunity_id) ?? [];
    bookings.push({
      appointmentId: appointment.id as string,
      assignedAgentId: (appointment.assigned_agent_id as string | null) ?? null,
      bookedAt: appointment.created_at as string,
    });
    bookingsByOpportunity.set(appointment.opportunity_id, bookings);
  }

  return opportunities.map((o) => ({
    opportunityId: o.id as string,
    assignedAgentId: (o.assigned_agent_id as string | null) ?? null,
    businessName: o.business_name as string,
    opportunityType: o.opportunity_type as CrmPerformanceOpportunityRecord["opportunityType"],
    stage: o.stage as string,
    createdAt: o.created_at as string,
    consultationBookings: bookingsByOpportunity.get(o.id as string) ?? [],
    proposalSentAt: (o.proposal_sent_at as string | null) ?? null,
    applicationSubmittedAt: (o.application_submitted_at as string | null) ?? null,
    closedAt: (o.closed_at as string | null) ?? null,
  }));
}

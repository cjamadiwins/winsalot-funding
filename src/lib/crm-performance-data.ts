import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type {
  CrmPerformanceConsultationBooking,
  CrmPerformanceDeliveredEmail,
  CrmPerformanceOpportunityRecord,
} from "./crm-performance";

// Fetches every crm_opportunities row shaped for computeCrmAgentPerformance.
// Unlike the old quote-linked version, this reads crm_opportunities
// directly. Consultation performance deliberately comes from
// winsalot_appointments instead: consultation_date is an optional planning
// field on the opportunity form and is not evidence of a real booking.
//
// Uses the service-role client so a single call can cover every agent for
// the admin's "every agent" view (/admin/crm/performance) without an
// extra round trip per agent. When agentId is supplied, the opportunity
// query includes both opportunities currently assigned to that agent and
// opportunities tied to one of their historical bookings or delivered
// emails. That preserves event-time credit even if the opportunity is
// later reassigned while still excluding unrelated agents' records.
export async function getCrmPerformanceRecords(agentId?: string): Promise<CrmPerformanceOpportunityRecord[]> {
  const admin = getSupabaseAdmin();

  const opportunityQuery = admin.from("crm_opportunities").select("id, business_name, assigned_agent_id, created_at");
  const appointmentQuery = admin
    .from("winsalot_appointments")
    .select("id, opportunity_id, assigned_agent_id, created_at")
    .eq("status", "booked")
    .not("opportunity_id", "is", null);
  const deliveredEmailQuery = admin
    .from("crm_lead_emails")
    .select("id, opportunity_id, agent_id, delivered_at")
    .in("email_type", ["follow_up", "consultation_invite"])
    .not("opportunity_id", "is", null)
    .not("delivered_at", "is", null);
  let opportunities;
  let appointments;
  let deliveredEmails;
  if (agentId) {
    const [appointmentResult, deliveredEmailResult] = await Promise.all([
      appointmentQuery.eq("assigned_agent_id", agentId),
      // Fetch every delivery credited to this agent directly - each
      // confirmed delivery is scored independently, so there is no need
      // to see other agents' deliveries for the same opportunity.
      deliveredEmailQuery.eq("agent_id", agentId),
    ]);
    appointments = appointmentResult.data;
    deliveredEmails = deliveredEmailResult.data;
    const eventOpportunityIds = Array.from(new Set([
      ...(appointments ?? []).map((appointment) => appointment.opportunity_id),
      ...(deliveredEmails ?? []).map((email) => email.opportunity_id),
    ].filter((id): id is string => Boolean(id))));
    const scope = [`assigned_agent_id.eq.${agentId}`];
    if (eventOpportunityIds.length > 0) scope.push(`id.in.(${eventOpportunityIds.join(",")})`);
    const opportunityResult = await opportunityQuery.or(scope.join(","));
    opportunities = opportunityResult.data;
  } else {
    const [opportunityResult, appointmentResult, deliveredEmailResult] = await Promise.all([
      opportunityQuery,
      appointmentQuery,
      deliveredEmailQuery,
    ]);
    opportunities = opportunityResult.data;
    appointments = appointmentResult.data;
    deliveredEmails = deliveredEmailResult.data;
  }

  const deliveredEmailsByOpportunity = new Map<string, CrmPerformanceDeliveredEmail[]>();
  for (const email of deliveredEmails ?? []) {
    if (!email.opportunity_id || !email.delivered_at) continue;
    const entries = deliveredEmailsByOpportunity.get(email.opportunity_id) ?? [];
    entries.push({
      emailId: email.id as string,
      agentId: (email.agent_id as string | null) ?? null,
      deliveredAt: email.delivered_at as string,
    });
    deliveredEmailsByOpportunity.set(email.opportunity_id, entries);
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
    createdAt: o.created_at as string,
    consultationBookings: bookingsByOpportunity.get(o.id as string) ?? [],
    deliveredEmails: deliveredEmailsByOpportunity.get(o.id as string) ?? [],
  }));
}

import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { fetchWinsalotAvailabilitySettings, fetchWinsalotBlackouts } from "./winsalot-consultation-availability";
import { generateWinsalotBookingSlots, isWinsalotSlotOffered, winsalotSlotEndIso } from "./winsalot-consultation-booking";
import { notifyOfNewWinsalotAppointment, notifyOfWinsalotCancellation, notifyOfWinsalotReschedule } from "./winsalot-consultation-notifications";
import { isValidEmail } from "./winsalot-consultation-types";
import { CLOSED_STAGES, OPPORTUNITY_TYPES, shouldAdvanceStageForConsultationBooking, type OpportunityStage, type OpportunityType } from "./crm-types";
import type { WinsalotAppointmentRow } from "./winsalot-consultation-types";

// Shared booking core - used by BOTH booking methods (the public
// self-booking action at /book-consultation and the agent/admin "Book
// Consultation" action from a prospect-detail page), so the two can
// never drift on validation, availability, double-booking prevention, or
// what happens to the linked prospect record afterward. Always writes
// through the service-role client: the caller (either the public,
// session-less action, or an agent/admin action already gated by
// requireCrmUser()/requireCrmAdmin()) is responsible for authorization -
// this function's own job is just "is this a real, currently-available
// slot, and is it booked correctly."

export type WinsalotBookingInput = {
  // Already-resolved opportunity id (from a validated prefill token, or
  // the agent/admin's own current prospect page) - null means "try to
  // match by email, else create a new prospect record."
  opportunityId: string | null;
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  serviceType: OpportunityType;
  notes: string | null;
  startUtcIso: string;
  prospectTimezone: string | null;
  bookedBy: "agent" | "self";
  bookedByUserId: string | null;
  assignedAgentId: string | null;
};

export type WinsalotBookingResult = { error?: string; appointmentId?: string };

function validateInput(input: WinsalotBookingInput): string | null {
  if (!input.contactName.trim()) return "Enter a contact name.";
  if (!input.businessName.trim()) return "Enter a business name.";
  if (!input.email.trim() || !isValidEmail(input.email)) return "Enter a valid email address.";
  if (!input.phone.trim()) return "Enter a phone number.";
  if (!OPPORTUNITY_TYPES.includes(input.serviceType)) return "Choose a valid service interest.";
  if (!input.startUtcIso || Number.isNaN(new Date(input.startUtcIso).getTime())) return "Choose a date and time.";
  return null;
}

export async function performWinsalotBooking(input: WinsalotBookingInput): Promise<WinsalotBookingResult> {
  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const admin = getSupabaseAdmin();

  const [settings, blackouts, { data: existingAppointments }] = await Promise.all([
    fetchWinsalotAvailabilitySettings(admin),
    fetchWinsalotBlackouts(admin),
    admin.from("winsalot_appointments").select("appointment_start_at, appointment_end_at").eq("status", "booked"),
  ]);

  const existingRanges = (existingAppointments ?? []).map((a) => ({
    startMs: new Date(a.appointment_start_at as string).getTime(),
    endMs: new Date(a.appointment_end_at as string).getTime(),
  }));

  if (!isWinsalotSlotOffered(input.startUtcIso, settings, blackouts, existingRanges)) {
    return { error: "That time is no longer available. Please choose another date or time." };
  }

  // Resolve the prospect record this appointment belongs to.
  let opportunityId = input.opportunityId;
  let currentStage: OpportunityStage | null = null;
  let opportunityAssignedAgentId: string | null = null;

  if (opportunityId) {
    const { data: opportunity } = await admin
      .from("crm_opportunities")
      .select("id, stage, assigned_agent_id")
      .eq("id", opportunityId)
      .maybeSingle();
    if (!opportunity) {
      return { error: "The linked prospect record could not be found." };
    }
    currentStage = opportunity.stage as OpportunityStage;
    opportunityAssignedAgentId = opportunity.assigned_agent_id as string | null;
  } else {
    const { data: matches } = await admin
      .from("crm_opportunities")
      .select("id, stage, assigned_agent_id, created_at")
      .ilike("email", input.email.trim())
      .order("created_at", { ascending: false });
    // Prefer the most recent still-open match over a closed one (Client
    // Won / Not Interested) - the same email booking a fresh consultation
    // years after an old opportunity was closed almost certainly means a
    // new inquiry, not a reason to resurrect the old closed record. Only
    // falls back to a closed match if that's genuinely the only one.
    const openMatch = (matches ?? []).find((m) => !CLOSED_STAGES.includes(m.stage as OpportunityStage));
    const match = openMatch ?? (matches ?? [])[0] ?? null;

    if (match) {
      opportunityId = match.id as string;
      currentStage = match.stage as OpportunityStage;
      opportunityAssignedAgentId = match.assigned_agent_id as string | null;
    } else {
      const { data: created, error: createError } = await admin
        .from("crm_opportunities")
        .insert({
          opportunity_type: input.serviceType,
          business_name: input.businessName.trim(),
          contact_name: input.contactName.trim(),
          phone: input.phone.trim(),
          email: input.email.trim(),
          notes: input.notes,
          stage: "New Prospect",
          created_by: null,
        })
        .select("id, stage, assigned_agent_id")
        .single();
      if (createError || !created) {
        console.error("[winsalot-consultations] failed to create prospect record:", createError);
        return { error: "Failed to save your consultation request. Please try again." };
      }
      opportunityId = created.id as string;
      currentStage = created.stage as OpportunityStage;
      opportunityAssignedAgentId = created.assigned_agent_id as string | null;
    }
  }

  const assignedAgentId = input.assignedAgentId ?? opportunityAssignedAgentId;

  const { data: appointment, error: insertError } = await admin
    .from("winsalot_appointments")
    .insert({
      opportunity_id: opportunityId,
      contact_name: input.contactName.trim(),
      business_name: input.businessName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      service_type: input.serviceType,
      notes: input.notes,
      appointment_start_at: input.startUtcIso,
      appointment_end_at: winsalotSlotEndIso(input.startUtcIso),
      prospect_timezone: input.prospectTimezone,
      business_timezone: settings.business_timezone,
      status: "booked",
      booked_by: input.bookedBy,
      booked_by_user_id: input.bookedByUserId,
      assigned_agent_id: assignedAgentId,
    })
    .select("*")
    .single();

  if (insertError || !appointment) {
    // Postgres exclusion-constraint violation code - someone else booked
    // an overlapping slot in the brief window between our availability
    // check and this insert (or this is a duplicate double-submit of the
    // exact same slot).
    if (insertError?.code === "23P01") {
      return { error: "That time was just booked. Please choose another time." };
    }
    console.error("[winsalot-consultations] failed to save appointment:", insertError);
    return { error: "Failed to book the appointment. Please try again." };
  }

  // "Change the prospect's stage to Consultation Booked. Do not
  // overwrite a more advanced stage such as Client Won." and link the
  // appointment's own assigned_agent_id if the opportunity didn't
  // already have one but this booking resolved one (e.g. an admin
  // explicitly picked an agent while booking).
  const opportunityUpdates: Record<string, unknown> = { last_contacted_at: new Date().toISOString() };
  if (currentStage && shouldAdvanceStageForConsultationBooking(currentStage)) {
    opportunityUpdates.stage = "Consultation Booked";
  }
  if (assignedAgentId && !opportunityAssignedAgentId) {
    opportunityUpdates.assigned_agent_id = assignedAgentId;
  }
  await admin.from("crm_opportunities").update(opportunityUpdates).eq("id", opportunityId);

  const bookedByLabel = input.bookedBy === "self" ? "self-booked via the public booking page" : "booked by an agent/admin";
  await admin.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: input.bookedByUserId,
    activity_type: "consultation_booked",
    notes: `Consultation ${bookedByLabel} for ${input.startUtcIso} (${settings.business_timezone}).`,
  });

  await notifyOfNewWinsalotAppointment(appointment as WinsalotAppointmentRow, input.bookedBy);

  return { appointmentId: appointment.id as string };
}

// Currently-offered slots for a staff-facing reschedule/booking UI -
// same source of truth generateWinsalotBookingSlots always uses,
// optionally excluding one appointment's own current slot from the
// conflict check (when rescheduling that same appointment).
export async function getWinsalotOfferedSlots(excludeAppointmentId?: string): Promise<{ slotIsos: string[]; businessTimezone: string }> {
  const admin = getSupabaseAdmin();
  const [settings, blackouts, existingQuery] = await Promise.all([
    fetchWinsalotAvailabilitySettings(admin),
    fetchWinsalotBlackouts(admin),
    (async () => {
      let query = admin.from("winsalot_appointments").select("appointment_start_at, appointment_end_at").eq("status", "booked");
      if (excludeAppointmentId) query = query.neq("id", excludeAppointmentId);
      return query;
    })(),
  ]);

  const existingRanges = (existingQuery.data ?? []).map((a) => ({
    startMs: new Date(a.appointment_start_at as string).getTime(),
    endMs: new Date(a.appointment_end_at as string).getTime(),
  }));

  const slots = generateWinsalotBookingSlots(settings, blackouts, existingRanges);
  return { slotIsos: slots.map((s) => s.startUtcIso), businessTimezone: settings.business_timezone };
}

export type WinsalotActorRole = "admin" | "agent" | "prospect";

export type WinsalotRescheduleResult = { error?: string };

// Shared reschedule core - used by the public token-based reschedule flow
// and the admin/agent "Reschedule" appointment action alike. "Both
// booking methods must use the same availability and prevent double
// booking" applies equally to a reschedule: this re-validates the new
// slot against the exact same rules as a fresh booking (excluding the
// appointment's own current slot from the conflict check, since it's
// being moved, not duplicated) and relies on the same database-level
// exclusion constraint as the final backstop.
export async function performWinsalotReschedule(
  appointmentId: string,
  newStartUtcIso: string,
  prospectTimezone: string | null,
  actor: { role: WinsalotActorRole; userId: string | null }
): Promise<WinsalotRescheduleResult> {
  if (!newStartUtcIso || Number.isNaN(new Date(newStartUtcIso).getTime())) {
    return { error: "Choose a date and time." };
  }

  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  const appt = appointment as WinsalotAppointmentRow;
  if (appt.status === "cancelled") return { error: "This consultation has already been cancelled." };

  const [settings, blackouts, { data: otherAppointments }] = await Promise.all([
    fetchWinsalotAvailabilitySettings(admin),
    fetchWinsalotBlackouts(admin),
    admin.from("winsalot_appointments").select("appointment_start_at, appointment_end_at").eq("status", "booked").neq("id", appointmentId),
  ]);

  const existingRanges = (otherAppointments ?? []).map((a) => ({
    startMs: new Date(a.appointment_start_at as string).getTime(),
    endMs: new Date(a.appointment_end_at as string).getTime(),
  }));

  if (!isWinsalotSlotOffered(newStartUtcIso, settings, blackouts, existingRanges)) {
    return { error: "That time is no longer available. Please choose another date or time." };
  }

  const { error: updateError } = await admin
    .from("winsalot_appointments")
    .update({
      appointment_start_at: newStartUtcIso,
      appointment_end_at: winsalotSlotEndIso(newStartUtcIso),
      prospect_timezone: prospectTimezone ?? appt.prospect_timezone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (updateError) {
    if (updateError.code === "23P01") return { error: "That time was just booked. Please choose another time." };
    console.error("[winsalot-consultations] failed to reschedule appointment:", updateError);
    return { error: "Failed to reschedule the appointment. Please try again." };
  }

  if (appt.opportunity_id) {
    await admin.from("crm_activities").insert({
      opportunity_id: appt.opportunity_id,
      agent_id: actor.role === "prospect" ? null : actor.userId,
      activity_type: "consultation_rescheduled",
      notes: `Consultation rescheduled by ${actor.role} from ${appt.appointment_start_at} to ${newStartUtcIso} (${settings.business_timezone}).`,
    });
  }

  const { data: updated } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (updated) await notifyOfWinsalotReschedule(updated as WinsalotAppointmentRow);

  return {};
}

export type WinsalotCancelResult = { error?: string };

// Shared cancellation core. "Cancellation must record who cancelled it
// and why" - actor.role/actor.userId and reason are always stamped onto
// the appointment row itself, regardless of which of the three possible
// cancellers (admin, agent, or the prospect via their own secure link)
// triggered it.
export async function performWinsalotCancellation(
  appointmentId: string,
  reason: string | null,
  actor: { role: WinsalotActorRole; userId: string | null }
): Promise<WinsalotCancelResult> {
  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  const appt = appointment as WinsalotAppointmentRow;
  if (appt.status === "cancelled") return { error: "This consultation has already been cancelled." };

  const { error: updateError } = await admin
    .from("winsalot_appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by_role: actor.role,
      cancelled_by_user_id: actor.role === "prospect" ? null : actor.userId,
      cancelled_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (updateError) {
    console.error("[winsalot-consultations] failed to cancel appointment:", updateError);
    return { error: "Failed to cancel the appointment. Please try again." };
  }

  if (appt.opportunity_id) {
    await admin.from("crm_activities").insert({
      opportunity_id: appt.opportunity_id,
      agent_id: actor.role === "prospect" ? null : actor.userId,
      activity_type: "consultation_cancelled",
      notes: `Consultation cancelled by ${actor.role}${reason ? ` — ${reason}` : ""}.`,
    });
  }

  await notifyOfWinsalotCancellation(appt);

  return {};
}

export type WinsalotAppointmentEditInput = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  serviceType: OpportunityType;
  notes: string;
};

// Edits the appointment's own contact/business/service/notes fields -
// never the date/time (that's Reschedule) and never who it's assigned to
// (an admin reassigns the underlying prospect from the opportunity page
// instead, which the appointment's assigned_agent_id already tracks
// independently of this).
export async function performWinsalotAppointmentEdit(appointmentId: string, input: WinsalotAppointmentEditInput): Promise<{ error?: string }> {
  if (!input.contactName.trim()) return { error: "Enter a contact name." };
  if (!input.businessName.trim()) return { error: "Enter a business name." };
  if (!input.email.trim() || !isValidEmail(input.email)) return { error: "Enter a valid email address." };
  if (!input.phone.trim()) return { error: "Enter a phone number." };
  if (!OPPORTUNITY_TYPES.includes(input.serviceType)) return { error: "Choose a valid service interest." };

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("winsalot_appointments")
    .update({
      business_name: input.businessName.trim(),
      contact_name: input.contactName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      service_type: input.serviceType,
      notes: input.notes.trim() ? input.notes.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (error) return { error: "Failed to save the appointment." };
  return {};
}

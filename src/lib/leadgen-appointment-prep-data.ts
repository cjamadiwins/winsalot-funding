import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentBriefRow, AppointmentFeedbackRow, PrepStatus } from "./leadgen-appointment-prep";

// Server-side reads shared by the Admin prep modal, the Appointments page
// indicator, the client portal and the reporting/insights panels. Every
// caller passes the client it should read through: the Admin pages pass
// the service-role client (after requireLeadgenAdmin), the portal passes
// the signed-in client's own session client so RLS does the isolation.

export async function fetchPrepStatusMap(supabase: SupabaseClient, clientId?: string): Promise<Record<string, PrepStatus>> {
  let query = supabase.from("leadgen_appointment_briefs").select("appointment_id, prep_status");
  if (clientId) query = query.eq("client_id", clientId);
  const { data } = await query;
  const map: Record<string, PrepStatus> = {};
  for (const row of data ?? []) map[row.appointment_id as string] = row.prep_status as PrepStatus;
  return map;
}

export async function fetchFeedbackRows(supabase: SupabaseClient, clientId?: string): Promise<AppointmentFeedbackRow[]> {
  let query = supabase.from("leadgen_appointment_feedback").select("*").order("submitted_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data } = await query;
  return (data ?? []) as AppointmentFeedbackRow[];
}

export async function fetchBrief(supabase: SupabaseClient, appointmentId: string): Promise<AppointmentBriefRow | null> {
  const { data } = await supabase.from("leadgen_appointment_briefs").select("*").eq("appointment_id", appointmentId).maybeSingle();
  return (data as AppointmentBriefRow | null) ?? null;
}

// Existing SDR call history for the lead - read-only, newest first. The
// original rows are never modified by the preparation feature.
export async function fetchSdrCallNotes(
  supabase: SupabaseClient,
  leadId: string | null
): Promise<{ id: string; occurred_at: string; call_outcome: string | null; notes: string }[]> {
  if (!leadId) return [];
  const { data } = await supabase
    .from("leadgen_lead_activities")
    .select("id, occurred_at, call_outcome, notes, activity_type")
    .eq("lead_id", leadId)
    .in("activity_type", ["call", "note"])
    .not("notes", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(8);
  return (data ?? [])
    .filter((row) => typeof row.notes === "string" && row.notes.trim())
    .map((row) => ({ id: row.id as string, occurred_at: row.occurred_at as string, call_outcome: (row.call_outcome as string | null) ?? null, notes: (row.notes as string).trim() }));
}

// Portal login(s) for a client - email, status and last login only. The
// password is never stored in or read from this table.
export async function fetchClientPortalLogins(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ id: string; full_name: string; email: string; active: boolean; last_login_at: string | null }[]> {
  const { data } = await supabase
    .from("leadgen_users")
    .select("id, full_name, email, active, last_login_at")
    .eq("role", "client")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  return (data ?? []) as { id: string; full_name: string; email: string; active: boolean; last_login_at: string | null }[];
}

// Sent -> Viewed, exactly once. Only ever flips a brief whose status is
// currently "sent_to_client" and that belongs to this client (the caller has
// already proven ownership with the client's own RLS session), so a draft
// brief, an already-viewed brief, or another client's brief can't change.
// Returns the new viewed_at, or null when nothing changed.
export async function markBriefViewed(admin: SupabaseClient, input: { appointmentId: string; clientId: string }): Promise<string | null> {
  const viewedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("leadgen_appointment_briefs")
    .update({ prep_status: "client_viewed", viewed_at: viewedAt, updated_at: viewedAt })
    .eq("appointment_id", input.appointmentId)
    .eq("client_id", input.clientId)
    .eq("prep_status", "sent_to_client")
    .select("appointment_id");
  if (error || !data || data.length === 0) return null;
  return viewedAt;
}

"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveNewLeadCampaign } from "@/lib/leadgen-new-lead-campaign";

type ActionResult = { error?: string };

// Admin files an automated booking that arrived without a verifiable campaign
// under the campaign they choose. Only ever fills an EMPTY campaign (compare-
// and-set on campaign_id is null), so a campaign that is already set - by the
// booking logic or by another Admin a moment ago - is never overwritten, and
// the campaign must be an active, visible one belonging to the appointment's
// own client.
export async function assignAppointmentCampaignAction(appointmentId: string, campaignId: string): Promise<ActionResult> {
  await requireLeadgenAdmin();
  if (!campaignId.trim()) return { error: "Select a campaign." };

  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("leadgen_appointments").select("id, client_id, campaign_id").eq("id", appointmentId).maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  if (appointment.campaign_id) return { error: "This appointment already has a campaign." };

  const resolved = await resolveNewLeadCampaign(admin, { campaignId, submittedClientId: appointment.client_id as string });
  if (!resolved.ok) return { error: resolved.error };

  const { data: updated, error } = await admin
    .from("leadgen_appointments")
    .update({ campaign_id: resolved.campaignId })
    .eq("id", appointmentId)
    .is("campaign_id", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: "Failed to assign the campaign." };
  if (!updated) return { error: "This appointment was just updated by someone else. Refresh and try again." };

  revalidatePath("/leadgen/admin/appointments");
  return {};
}

// Closes out a queued automated booking once the Admin has handled it (for
// example by booking the appointment by hand under the right client) or
// decided it doesn't need action. Only pending items can be closed, and the
// stored payload is kept either way.
export async function closeBookingReviewItemAction(itemId: string, status: "resolved" | "dismissed", note: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  if (status !== "resolved" && status !== "dismissed") return { error: "Invalid status." };

  const admin = getSupabaseAdmin();
  const { data: updated, error } = await admin
    .from("leadgen_booking_review_queue")
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: adminUser.id, resolution_note: note.trim() || null })
    .eq("id", itemId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { error: "Failed to update the review item." };
  if (!updated) return { error: "This item was already handled." };

  revalidatePath("/leadgen/admin/appointments");
  return {};
}

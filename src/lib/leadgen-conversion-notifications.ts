import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Conversion Tracking in-app admin notifications - reuses the existing
// leadgen_notifications table (migration 0071), same per-admin,
// dedupe-by-(user, title, link_path)-while-unread technique as
// notifyLeadgenAdmins in leadgen-monitoring-notifications.ts (that
// helper is private to that file, so this is its own small copy rather
// than a cross-file import, exactly the same way the rest of this CRM's
// notification helpers are each self-contained per feature area).
async function notifyLeadgenAdmins(admin: SupabaseClient, input: { title: string; body: string; linkPath: string }): Promise<void> {
  const { data: admins } = await admin.from("leadgen_users").select("id").eq("role", "admin").eq("active", true);
  if (!admins || admins.length === 0) return;

  for (const row of admins as { id: string }[]) {
    const { data: existing } = await admin
      .from("leadgen_notifications")
      .select("id")
      .eq("user_id", row.id)
      .eq("link_path", input.linkPath)
      .eq("title", input.title)
      .eq("is_read", false)
      .maybeSingle();
    if (existing) continue;

    await admin.from("leadgen_notifications").insert({ user_id: row.id, title: input.title, body: input.body, link_path: input.linkPath });
  }
}

// A client submitted a new conversion report (any result, including a
// reported payment received) - brief: "Notify Admin when a client
// reports a new conversion / reports a payment received." Deliberately
// one notification per submission (not per admin action later), so
// re-reviewing/rejecting/re-confirming the same report never sends a
// second one - the dedupe-while-unread key includes the conversion id via
// linkPath, so a second, genuinely NEW report on the same conversion
// (after the first was read) is still its own notification.
export async function notifyAdminsOfClientConversionReport(
  admin: SupabaseClient,
  input: { conversionId: string; clientName: string; businessName: string; resultLabel: string }
): Promise<void> {
  await notifyLeadgenAdmins(admin, {
    title: `${input.clientName} reported a conversion update`,
    body: `${input.businessName}: ${input.resultLabel}. Review and confirm/reject in Conversions.`,
    linkPath: `/leadgen/admin/conversions?highlight=${input.conversionId}`,
  });
}

// A performance-payment stage became due the moment Admin confirmed a
// paying conversion (brief: "Notify/show Admin that the performance
// trigger has occurred"). Sent to every admin (not just the one who
// confirmed it), since another admin may be the one who follows up on
// invoicing/collection.
export async function notifyAdminsOfPerformancePaymentTrigger(
  admin: SupabaseClient,
  input: { triggerId: string; clientName: string; stageLabel: string; amount: number; currency: string }
): Promise<void> {
  await notifyLeadgenAdmins(admin, {
    title: `Performance payment triggered: ${input.clientName}`,
    body: `${input.stageLabel} - ${input.currency} ${input.amount.toLocaleString()} is now due. Do not mark as received until Winsalot actually receives payment.`,
    linkPath: `/leadgen/admin/conversions?trigger=${input.triggerId}`,
  });
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSmsToNumber } from "./twilio";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmUserRow } from "./crm-types";

export type ProviderSmsTarget = { providerLeadId: string } | { cleaningProviderId: string };

// Provider Profile's "Send SMS" quick action - texts the provider's own
// phone number directly, whether it's a Provider Acquisition lead
// (pre-approval) or an operational provider. Completely separate from the
// pre-existing internal SMS *notifications* (src/lib/twilio.ts's
// sendSms(), which always targets the fixed SMS_NOTIFICATION_NUMBER and
// is unchanged).
export async function sendProviderSms(
  supabase: SupabaseClient,
  target: ProviderSmsTarget,
  crmUser: CrmUserRow,
  message: string
): Promise<{ phone: string }> {
  const table = "providerLeadId" in target ? "provider_leads" : "cleaning_providers";
  const id = "providerLeadId" in target ? target.providerLeadId : target.cleaningProviderId;
  const targetColumn = "providerLeadId" in target ? "provider_lead_id" : "cleaning_provider_id";

  const { data: provider, error: fetchError } = await supabase
    .from(table)
    .select("phone")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !provider) {
    throw new Error("Provider not found.");
  }
  if (!provider.phone) {
    throw new Error("This provider has no phone number on file.");
  }

  await sendSmsToNumber(provider.phone, message);

  const { data: activity, error: activityError } = await supabase
    .from("crm_activities")
    .insert({
      [targetColumn]: id,
      agent_id: crmUser.id,
      activity_type: "text",
      notes: `SMS sent to ${provider.phone} by ${crmUser.full_name || crmUser.email}: "${message}"`,
    })
    .select("id")
    .single();

  if (activityError) {
    throw new Error("The SMS was sent, but recording it in the activity history failed.");
  }

  const admin = getSupabaseAdmin();
  const { error: logError } = await admin.from("provider_sms_messages").insert({
    [targetColumn]: id,
    agent_id: crmUser.id,
    to_phone: provider.phone,
    body: message,
    activity_id: activity?.id ?? null,
  });
  if (logError) {
    throw new Error("The SMS was sent, but logging it failed.");
  }

  const { error: contactError } = await supabase
    .from(table)
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", id);
  if (contactError) {
    throw new Error("The SMS was sent, but updating the last-contact date failed.");
  }

  return { phone: provider.phone };
}

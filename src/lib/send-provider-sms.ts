import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSmsToNumber } from "./twilio";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmUserRow } from "./crm-types";

// Provider Profile's "Send SMS" quick action - texts the provider's own
// phone number directly. Completely separate from the pre-existing
// internal SMS *notifications* (src/lib/twilio.ts's sendSms(), which
// always targets the fixed SMS_NOTIFICATION_NUMBER and is unchanged).
export async function sendProviderSms(
  supabase: SupabaseClient,
  providerLeadId: string,
  crmUser: CrmUserRow,
  message: string
): Promise<{ phone: string }> {
  const { data: provider, error: fetchError } = await supabase
    .from("provider_leads")
    .select("phone")
    .eq("id", providerLeadId)
    .maybeSingle();

  if (fetchError || !provider) {
    throw new Error("Provider lead not found.");
  }
  if (!provider.phone) {
    throw new Error("This provider has no phone number on file.");
  }

  await sendSmsToNumber(provider.phone, message);

  const { data: activity, error: activityError } = await supabase
    .from("crm_activities")
    .insert({
      provider_lead_id: providerLeadId,
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
    provider_lead_id: providerLeadId,
    agent_id: crmUser.id,
    to_phone: provider.phone,
    body: message,
    activity_id: activity?.id ?? null,
  });
  if (logError) {
    throw new Error("The SMS was sent, but logging it failed.");
  }

  const { error: contactError } = await supabase
    .from("provider_leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", providerLeadId);
  if (contactError) {
    throw new Error("The SMS was sent, but updating the last-contact date failed.");
  }

  return { phone: provider.phone };
}

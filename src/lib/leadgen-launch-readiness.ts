import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

export const WEBSITE_LAUNCH_DATE = "2026-09-29";
export const WEBSITE_LAUNCH_CLIENTS = ["Hidebrandt Web Services", "Teknokraft Canada Inc.", "Web6 Solutions"] as const;

export function torontoDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function getWebsiteLaunchReadiness(clientId: string) {
  const admin = getSupabaseAdmin();
  const { data: growthClient, error: clientError } = await admin.from("crm_clients").select("id").eq("leadgen_client_id", clientId).maybeSingle();
  if (clientError) throw clientError;
  const { data: agreement, error: agreementError } = growthClient
    ? await admin.from("crm_client_agreements")
      .select("status, sent_at, accepted_at, campaign_start_date, staged_deposit_amount, staged_deposit_status")
      .eq("client_id", growthClient.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null, error: null };
  if (agreementError) throw agreementError;
  const accepted = agreement?.status === "signed" && !!agreement.accepted_at;
  const depositRequired = Number(agreement?.staged_deposit_amount ?? 0) > 0;
  const depositReceived = depositRequired && agreement?.staged_deposit_status === "paid";
  const blockers: string[] = [];
  if (!accepted) blockers.push(agreement?.sent_at ? "Agreement sent; acceptance not recorded" : "Agreement not yet sent or accepted");
  if (depositRequired && !depositReceived) blockers.push("Deposit pending");
  if (agreement?.campaign_start_date && agreement.campaign_start_date !== WEBSITE_LAUNCH_DATE) blockers.push(`Agreement start date is ${agreement.campaign_start_date}; review before September 29 launch`);
  return {
    agreementLabel: accepted ? "Agreement Accepted / Consented" : agreement?.sent_at ? "Agreement Sent — awaiting acceptance" : "Agreement Draft / Not Sent",
    depositLabel: depositRequired ? depositReceived ? "Deposit Received" : "Deposit Pending" : "No staged deposit required",
    agreementStartDate: agreement?.campaign_start_date ?? null,
    blockers,
  };
}

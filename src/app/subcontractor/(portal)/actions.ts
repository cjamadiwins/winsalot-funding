"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireGrowthSubcontractor } from "@/lib/subcontractor-auth";
import { CALL_LOG_AUTOMATIC_NOTES, isCallLogOutcome } from "@/lib/call-log";

export async function signOutSubcontractorAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/subcontractor");
}

export async function acceptSubcontractorAgreementAction(agreementId: string, formData: FormData): Promise<{ error?: string }> {
  const subcontractor = await requireGrowthSubcontractor();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const signature = String(formData.get("signature") ?? "").trim();
  const accepted = formData.get("accepted") === "yes";
  if (!fullName || !signature) return { error: "Enter your full legal name and typed signature." };
  if (!accepted) return { error: "You must accept the agreement before signing." };
  const admin = getSupabaseAdmin();
  const { data: agreement } = await admin.from("crm_subcontractor_agreements").select("id, status").eq("id", agreementId).eq("subcontractor_id", subcontractor.id).maybeSingle();
  if (!agreement || agreement.status !== "sent") return { error: "This agreement is not available for signature." };
  const now = new Date().toISOString();
  const { error } = await admin.from("crm_subcontractor_agreements").update({ status: "signed", accepted_at: now, signer_full_name: fullName, signer_signature_text: signature, accepted_by_auth_user: subcontractor.auth_user_id }).eq("id", agreementId).eq("status", "sent");
  if (error) return { error: "Could not record your signature. Please try again." };
  revalidatePath("/subcontractor/agreement");
  revalidatePath("/subcontractor/dashboard");
  return {};
}

export async function createSubcontractorCallLogAction(formData: FormData): Promise<{ error?: string }> {
  const subcontractor = await requireGrowthSubcontractor();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const extra = String(formData.get("extra_details") ?? "").trim();
  if (!businessName || !phone) return { error: "Business name and phone number are required." };
  if (!isCallLogOutcome(outcome)) return { error: "Select a valid call result." };
  const admin = getSupabaseAdmin();
  const { data: signedAgreement } = await admin.from("crm_subcontractor_agreements").select("id").eq("subcontractor_id", subcontractor.id).eq("status", "signed").limit(1).maybeSingle();
  if (!signedAgreement) return { error: "Sign your Independent Contractor Agreement before logging calls." };
  let clientName = "Winsalot Corp.";
  if (subcontractor.business_client_id) {
    const { data: client } = await admin.from("crm_clients").select("company_name").eq("id", subcontractor.business_client_id).maybeSingle();
    if (client?.company_name) clientName = client.company_name;
  }
  const automatic = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const { error } = await (await createSupabaseServerClient()).from("crm_subcontractor_call_logs").insert({ subcontractor_id: subcontractor.id, business_name: businessName, phone, outcome, notes: extra ? `${automatic} — ${extra}` : automatic, business_client_name: clientName });
  if (error) return { error: `Failed to save the call: ${error.message}` };
  revalidatePath("/subcontractor/call-log");
  return {};
}

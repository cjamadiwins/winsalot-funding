"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendSubcontractorPortalEmail } from "@/lib/subcontractor-portal-email";
import { buildSubcontractorAgreementText, SUBCONTRACTOR_AGREEMENT_VERSION } from "@/lib/subcontractor-agreement";
import type { SubcontractorRow } from "@/lib/subcontractor-payroll";

type Result = { error?: string };

async function load(id: string): Promise<SubcontractorRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("crm_subcontractors").select("*").eq("id", id).maybeSingle();
  return data as SubcontractorRow | null;
}

export async function sendSubcontractorInviteAction(id: string): Promise<Result> {
  await requireCrmAdmin();
  const subcontractor = await load(id);
  if (!subcontractor) return { error: "Subcontractor not found." };
  if (!subcontractor.email) return { error: "Add an email address before sending portal access." };

  const admin = getSupabaseAdmin();
  let authUserId = subcontractor.auth_user_id;
  if (!authUserId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: subcontractor.email,
      email_confirm: false,
      user_metadata: { full_name: subcontractor.full_name, account_type: "subcontractor" },
    });
    if (error || !data.user) {
      const message = error?.message?.toLowerCase() ?? "";
      return { error: message.includes("already") ? "A login already exists for this email. Use a separate subcontractor email." : error?.message ?? "Could not create portal access." };
    }
    authUserId = data.user.id;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("crm_subcontractors").update({
    auth_user_id: authUserId,
    portal_active: true,
    invited_at: now,
  }).eq("id", id);
  if (updateError) {
    if (!subcontractor.auth_user_id) await admin.auth.admin.deleteUser(authUserId);
    return { error: "Could not activate the subcontractor portal." };
  }

  const { data: currentAgreement } = await admin
    .from("crm_subcontractor_agreements")
    .select("id")
    .eq("subcontractor_id", id)
    .in("status", ["sent", "signed"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!currentAgreement) {
    const { error: agreementError } = await admin.from("crm_subcontractor_agreements").insert({
      subcontractor_id: id,
      version: SUBCONTRACTOR_AGREEMENT_VERSION,
      status: "sent",
      agreement_text: buildSubcontractorAgreementText(subcontractor),
      currency: subcontractor.currency,
      pay_type: subcontractor.pay_type,
      pay_rate: subcontractor.pay_rate,
    });
    if (agreementError) return { error: "Portal access was created, but the agreement could not be prepared." };
  }

  const emailResult = await sendSubcontractorPortalEmail({ kind: "invite", email: subcontractor.email, fullName: subcontractor.full_name });
  if (emailResult.error) return emailResult;
  revalidatePath("/admin/crm/payroll");
  return {};
}

export async function setSubcontractorPortalActiveAction(id: string, active: boolean): Promise<Result> {
  await requireCrmAdmin();
  const subcontractor = await load(id);
  if (!subcontractor?.auth_user_id) return { error: "Portal access has not been created yet." };
  const { error } = await getSupabaseAdmin().from("crm_subcontractors").update({ portal_active: active }).eq("id", id);
  if (error) return { error: "Could not update portal access." };
  revalidatePath("/admin/crm/payroll");
  return {};
}

export async function resetSubcontractorPortalAction(id: string): Promise<Result> {
  await requireCrmAdmin();
  const subcontractor = await load(id);
  if (!subcontractor?.auth_user_id || !subcontractor.email) return { error: "Portal access has not been created yet." };
  return sendSubcontractorPortalEmail({ kind: "reset", email: subcontractor.email, fullName: subcontractor.full_name });
}

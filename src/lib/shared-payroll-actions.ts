"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import * as growth from "@/app/admin/(dashboard)/crm/payroll/actions";
import * as leadgen from "@/app/leadgen/admin/(dashboard)/payroll/actions";
import { loadHolidayPaySummaryAction as growthHoliday } from "@/app/admin/(dashboard)/crm/payroll/holiday-actions";
import { loadHolidayPaySummaryAction as leadgenHoliday } from "@/app/leadgen/admin/(dashboard)/payroll/holiday-actions";

type Source = "growth" | "leadgen";
// Resolve provenance from RLS-protected records, never from a submitted CRM flag.
async function sourceForRecord(id: string): Promise<Source | null> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("winsalot_payroll").select("source_crm").eq("id", id).maybeSingle();
  return error ? null : data?.source_crm ?? null;
}
async function sourceForAgent(id: string, payday?: string): Promise<Source | null> {
  const db = await createSupabaseServerClient();
  if (payday) {
    const { data, error } = await db.from("winsalot_payroll").select("source_crm").eq("agent_id", id).eq("payday", payday).maybeSingle();
    if (error) return null;
    if (data) return data.source_crm;
  }
  const { data, error } = await db.from("winsalot_payroll_agents").select("source_crm").eq("id", id).maybeSingle();
  return error ? null : data?.source_crm ?? null;
}
async function authorized(source: Source | null): Promise<Source | null> {
  if (!source) return null;
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  // Preserve the existing source write permissions and actor foreign keys.
  // Shared read access never implicitly grants additional write privileges.
  const { data } = await db.from(source === "growth" ? "crm_users" : "leadgen_users")
    .select("id").eq("id", user.id).eq("role", "admin").eq("active", true).maybeSingle();
  return data ? source : null;
}
function refreshSharedPayroll() {
  for (const path of ["/admin/crm/payroll", "/leadgen/admin/payroll", "/agent/pay", "/leadgen/agent/pay"]) revalidatePath(path);
}
const denied = { error: "Payroll unavailable or you do not have Admin permission in this record’s original workflow." };

export async function updatePayrollAction(recordId: string, formData: FormData) {
  const source = await authorized(await sourceForRecord(recordId));
  if (!source) return denied;
  const result = await (source === "growth" ? growth.updatePayrollAction : leadgen.updateLeadgenPayrollAction)(recordId, formData);
  if (!result.error) refreshSharedPayroll();
  return result;
}

export async function approvePayrollAction(recordId: string, formData: FormData) {
  const source = await authorized(await sourceForRecord(recordId));
  if (!source) return denied;
  const result = await (source === "growth" ? growth.approvePayrollAction : leadgen.approveLeadgenPayrollAction)(recordId, formData);
  if (!result.error) refreshSharedPayroll();
  return result;
}

export async function markPayrollPaidAction(recordId: string, formData: FormData) {
  const source = await authorized(await sourceForRecord(recordId));
  if (!source) return denied;
  const result = await (source === "growth" ? growth.markPayrollPaidAction : leadgen.markLeadgenPayrollPaidAction)(recordId, formData);
  if (!result.error) refreshSharedPayroll();
  return result;
}

export async function cancelPayrollAction(recordId: string, formData: FormData) {
  const source = await authorized(await sourceForRecord(recordId));
  if (!source) return denied;
  const result = await (source === "growth" ? growth.cancelPayrollAction : leadgen.cancelLeadgenPayrollAction)(recordId, formData);
  if (!result.error) refreshSharedPayroll();
  return result;
}

export async function reopenPayrollAction(recordId: string, formData: FormData) {
  const source = await authorized(await sourceForRecord(recordId));
  if (!source) return denied;
  const result = await (source === "growth" ? growth.reopenPayrollAction : leadgen.reopenLeadgenPayrollAction)(recordId, formData);
  if (!result.error) refreshSharedPayroll();
  return result;
}

export async function createPayrollAction(formData: FormData) {
  const source = await authorized(await sourceForAgent(String(formData.get("agent_id") ?? "")));
  if (!source) return denied;
  const result = await (source === "growth" ? growth.createPayrollAction : leadgen.createLeadgenPayrollAction)(formData);
  if (!result.error) refreshSharedPayroll();
  return result;
}
export async function loadAttendanceSummaryAction(agentId: string, payday: string) {
  const source = await authorized(await sourceForAgent(agentId, payday));
  if (!source) return denied;
  return (source === "growth" ? growth.loadAttendanceSummaryAction : leadgen.loadLeadgenAttendanceSummaryAction)(agentId, payday);
}
export async function loadHolidayPaySummaryAction(agentId: string, payday: string) {
  const source = await authorized(await sourceForAgent(agentId, payday));
  if (!source) return denied;
  return (source === "growth" ? growthHoliday : leadgenHoliday)(agentId, payday);
}
export async function updatePayrollAgentCurrencyAction(agentId: string, currency: string, payday?: string) {
  const source = await authorized(await sourceForAgent(agentId, payday));
  if (!source) return denied;
  const result = await (source === "growth" ? growth.updatePayrollAgentCurrencyAction : leadgen.updateLeadgenPayrollAgentCurrencyAction)(agentId, currency);
  if (!result.error) refreshSharedPayroll();
  return result;
}

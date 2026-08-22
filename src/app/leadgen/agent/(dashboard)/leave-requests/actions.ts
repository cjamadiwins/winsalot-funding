"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { computeNoticeDays, isShortNotice, type LeaveType } from "@/lib/leave-requests";
import { notifyAdminsOfNewLeadgenLeaveRequest, recordLeadgenLeaveAudit } from "@/lib/leadgen-leave-notifications";

// Mirrors src/app/agent/(dashboard)/leave-requests/actions.ts exactly,
// but against leadgen_leave_requests / leadgen_users - this CRM's own,
// entirely separate agent pool and table (migration 0070).
type ActionResult = { error?: string };

export async function submitLeadgenLeaveRequestAction(formData: FormData): Promise<ActionResult> {
  const leadgenUser = await requireLeadgenAgent();

  const leaveTypeRaw = String(formData.get("leave_type") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (leaveTypeRaw !== "planned" && leaveTypeRaw !== "emergency") {
    return { error: "Select Planned Leave or Emergency Leave." };
  }
  const leaveType = leaveTypeRaw as LeaveType;

  if (!startDate || !endDate) return { error: "Start and end dates are required." };
  if (endDate < startDate) return { error: "End date can't be before the start date." };
  if (!reason) return { error: "A reason is required." };

  const submittedAt = new Date().toISOString();
  const noticeDays = computeNoticeDays(submittedAt, startDate);
  const shortNotice = isShortNotice(leaveType, noticeDays);
  const agentName = leadgenUser.full_name || leadgenUser.email;

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from("leadgen_leave_requests")
    .insert({
      agent_id: leadgenUser.id,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason,
      submitted_at: submittedAt,
      notice_days: noticeDays,
      is_short_notice: shortNotice,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `Failed to submit your leave request: ${error?.message ?? "unknown error"}` };
  }

  await recordLeadgenLeaveAudit({
    leaveRequestId: inserted.id,
    agentId: leadgenUser.id,
    agentName,
    action: "submitted",
    performedById: leadgenUser.id,
    performedByName: agentName,
    details: { leave_type: leaveType, start_date: startDate, end_date: endDate, notice_days: noticeDays, is_short_notice: shortNotice },
  });

  await notifyAdminsOfNewLeadgenLeaveRequest({ agentName, isShortNotice: shortNotice });

  revalidatePath("/leadgen/agent/leave-requests");
  revalidatePath("/leadgen/admin/leave-requests");
  return {};
}

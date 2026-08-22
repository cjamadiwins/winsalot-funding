"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { computeNoticeDays, isShortNotice, type LeaveType } from "@/lib/leave-requests";
import { notifyAdminsOfNewCrmLeaveRequest, recordCrmLeaveAudit } from "@/lib/crm-leave-notifications";

// Returns { error } instead of throwing, matching crm/attendance/actions.ts -
// Next.js redacts thrown Server Action errors to a generic message in
// production, which would swallow our own validation messages too.
type ActionResult = { error?: string };

export async function submitLeaveRequestAction(formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();

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
  const agentName = crmUser.full_name || crmUser.email;

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from("crm_leave_requests")
    .insert({
      agent_id: crmUser.id,
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

  await recordCrmLeaveAudit({
    leaveRequestId: inserted.id,
    agentId: crmUser.id,
    agentName,
    action: "submitted",
    performedById: crmUser.id,
    performedByName: agentName,
    details: { leave_type: leaveType, start_date: startDate, end_date: endDate, notice_days: noticeDays, is_short_notice: shortNotice },
  });

  await notifyAdminsOfNewCrmLeaveRequest({ agentName, isShortNotice: shortNotice });

  revalidatePath("/agent/leave-requests");
  revalidatePath("/admin/crm/leave-requests");
  return {};
}

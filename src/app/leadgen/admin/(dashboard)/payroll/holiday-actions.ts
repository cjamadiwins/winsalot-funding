"use server";

// Thin Lead Generation CRM bindings over the shared Holiday Pay actions
// (src/lib/holiday-pay-actions.ts) - every call is pinned to crm="leadgen"
// so this page never has to pass that string around (and can never
// accidentally operate on the Growth CRM's agents). Mirrors
// src/app/admin/(dashboard)/crm/payroll/holiday-actions.ts exactly.

import {
  assignHolidayAction as sharedAssignHolidayAction,
  createHolidayAction as sharedCreateHolidayAction,
  deactivateHolidayAction as sharedDeactivateHolidayAction,
  deleteHolidayAction as sharedDeleteHolidayAction,
  loadHolidayPaySummaryAction as sharedLoadHolidayPaySummaryAction,
  overrideAssignmentAmountAction as sharedOverrideAssignmentAmountAction,
  reactivateHolidayAction as sharedReactivateHolidayAction,
  removeAssignmentAction as sharedRemoveAssignmentAction,
  updateHolidayAction as sharedUpdateHolidayAction,
} from "@/lib/holiday-pay-actions";

export async function createHolidayAction(formData: FormData) {
  return sharedCreateHolidayAction("leadgen", formData);
}

export async function updateHolidayAction(holidayId: string, formData: FormData) {
  return sharedUpdateHolidayAction("leadgen", holidayId, formData);
}

export async function deactivateHolidayAction(holidayId: string, formData: FormData) {
  return sharedDeactivateHolidayAction("leadgen", holidayId, formData);
}

export async function reactivateHolidayAction(holidayId: string) {
  return sharedReactivateHolidayAction("leadgen", holidayId);
}

export async function deleteHolidayAction(holidayId: string, formData: FormData) {
  return sharedDeleteHolidayAction("leadgen", holidayId, formData);
}

export async function assignHolidayAction(holidayId: string, formData: FormData) {
  return sharedAssignHolidayAction("leadgen", holidayId, formData);
}

export async function removeAssignmentAction(assignmentId: string, formData: FormData) {
  return sharedRemoveAssignmentAction("leadgen", assignmentId, formData);
}

export async function overrideAssignmentAmountAction(assignmentId: string, formData: FormData) {
  return sharedOverrideAssignmentAmountAction("leadgen", assignmentId, formData);
}

export async function loadHolidayPaySummaryAction(agentId: string, payday: string) {
  return sharedLoadHolidayPaySummaryAction("leadgen", agentId, payday);
}

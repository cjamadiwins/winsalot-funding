"use server";

// Thin Growth CRM bindings over the shared Holiday Pay actions
// (src/lib/holiday-pay-actions.ts) - every call is pinned to crm="growth"
// so this page never has to pass that string around (and can never
// accidentally operate on the Lead Generation CRM's agents).

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
  return sharedCreateHolidayAction("growth", formData);
}

export async function updateHolidayAction(holidayId: string, formData: FormData) {
  return sharedUpdateHolidayAction("growth", holidayId, formData);
}

export async function deactivateHolidayAction(holidayId: string, formData: FormData) {
  return sharedDeactivateHolidayAction("growth", holidayId, formData);
}

export async function reactivateHolidayAction(holidayId: string) {
  return sharedReactivateHolidayAction("growth", holidayId);
}

export async function deleteHolidayAction(holidayId: string, formData: FormData) {
  return sharedDeleteHolidayAction("growth", holidayId, formData);
}

export async function assignHolidayAction(holidayId: string, formData: FormData) {
  return sharedAssignHolidayAction("growth", holidayId, formData);
}

export async function removeAssignmentAction(assignmentId: string, formData: FormData) {
  return sharedRemoveAssignmentAction("growth", assignmentId, formData);
}

export async function overrideAssignmentAmountAction(assignmentId: string, formData: FormData) {
  return sharedOverrideAssignmentAmountAction("growth", assignmentId, formData);
}

export async function loadHolidayPaySummaryAction(agentId: string, payday: string) {
  return sharedLoadHolidayPaySummaryAction("growth", agentId, payday);
}

"use server";

// Thin Growth CRM bindings over the shared Subcontractor actions
// (src/lib/subcontractor-actions.ts) - every call is pinned to
// crm="growth" so this page never has to pass that string around (and can
// never accidentally operate on the Lead Generation CRM's subcontractors).

import {
  createSubcontractorAction as sharedCreateSubcontractorAction,
  createSubcontractorPaymentAction as sharedCreateSubcontractorPaymentAction,
  deactivateSubcontractorAction as sharedDeactivateSubcontractorAction,
  reactivateSubcontractorAction as sharedReactivateSubcontractorAction,
  updateSubcontractorAction as sharedUpdateSubcontractorAction,
  updateSubcontractorPaymentAction as sharedUpdateSubcontractorPaymentAction,
} from "@/lib/subcontractor-actions";

export async function createSubcontractorAction(formData: FormData) {
  return sharedCreateSubcontractorAction("growth", formData);
}

export async function updateSubcontractorAction(subcontractorId: string, formData: FormData) {
  return sharedUpdateSubcontractorAction("growth", subcontractorId, formData);
}

export async function deactivateSubcontractorAction(subcontractorId: string) {
  return sharedDeactivateSubcontractorAction("growth", subcontractorId);
}

export async function reactivateSubcontractorAction(subcontractorId: string) {
  return sharedReactivateSubcontractorAction("growth", subcontractorId);
}

export async function createSubcontractorPaymentAction(subcontractorId: string, formData: FormData) {
  return sharedCreateSubcontractorPaymentAction("growth", subcontractorId, formData);
}

export async function updateSubcontractorPaymentAction(paymentId: string, formData: FormData) {
  return sharedUpdateSubcontractorPaymentAction("growth", paymentId, formData);
}

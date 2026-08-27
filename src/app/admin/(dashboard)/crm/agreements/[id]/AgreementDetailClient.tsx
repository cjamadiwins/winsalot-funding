"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  updateAgreementDraftAction,
  sendAgreementAction,
  resendAgreementAction,
  recordAgreementInvoiceAction,
  type AgreementDraftInput,
} from "../actions";
import { getOrCreateIntakeConfigAction } from "../../intake/[id]/actions";
import {
  AGREEMENT_SERVICE_TYPES,
  AGREEMENT_SERVICE_TYPE_LABELS,
  AGREEMENT_TARGET_TYPES,
  AGREEMENT_BILLING_FREQUENCIES,
  type AgreementServiceType,
  type AgreementTargetType,
  type AgreementBillingFrequency,
  type CrmAgreementTemplateRow,
  type CrmClientAgreementRow,
  type CrmAgreementEventRow,
  type CrmAgreementInvoiceRow,
  type RenderedAgreementSection,
} from "@/lib/crm-agreement-types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses = "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

function toDraftInput(a: CrmClientAgreementRow): AgreementDraftInput {
  return {
    legalBusinessName: a.legal_business_name,
    contactPerson: a.contact_person,
    businessEmail: a.business_email,
    serviceType: a.service_type,
    targetType: a.target_type,
    monthlyTarget: a.monthly_target,
    monthlyFee: a.monthly_fee,
    setupFee: a.setup_fee,
    targetIndustries: a.target_industries,
    targetLocations: a.target_locations,
    campaignStartDate: a.campaign_start_date,
    billingFrequency: a.billing_frequency,
    paymentDueTerms: a.payment_due_terms,
    initialTerm: a.initial_term,
    renewalTerms: a.renewal_terms,
    cancellationTerms: a.cancellation_terms,
    additionalNotes: a.additional_notes,
  };
}

export default function AgreementDetailClient({
  agreement,
  template,
  sections,
  events,
  intakeConfigId,
  hasSubmission,
  invoice,
  openRecordInvoice,
}: {
  agreement: CrmClientAgreementRow;
  template: CrmAgreementTemplateRow;
  sections: RenderedAgreementSection[];
  events: CrmAgreementEventRow[];
  intakeConfigId: string | null;
  hasSubmission: boolean;
  invoice: CrmAgreementInvoiceRow | null;
  openRecordInvoice: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(agreement.status === "draft");
  const [draft, setDraft] = useState<AgreementDraftInput>(toDraftInput(agreement));
  const [reviewedConfirmation, setReviewedConfirmation] = useState(false);
  const [showRecordInvoice, setShowRecordInvoice] = useState(openRecordInvoice);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: "",
    invoiceAmount: String(agreement.monthly_fee + (agreement.setup_fee ?? 0)),
    dateSent: "",
    paymentDueDate: "",
  });

  function set<K extends keyof AgreementDraftInput>(key: K, value: AgreementDraftInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function runAction(fn: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <div>
      <Link href="/admin/crm/agreements" className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
        ← Back to Client Agreements
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{agreement.legal_business_name}</h1>
        <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold capitalize text-indigo-800">{agreement.status}</span>
      </div>
      <p className="text-sm text-slate-500">Version {agreement.version}</p>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {template.legal_status !== "approved" && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          DRAFT — PENDING LEGAL REVIEW
        </div>
      )}

      {editing ? (
        <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
          <h2 className="text-base font-bold text-slate-900">Edit Draft</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Legal Business Name">
              <input value={draft.legalBusinessName} onChange={(e) => set("legalBusinessName", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contact Person">
              <input value={draft.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Business Email">
              <input type="email" value={draft.businessEmail} onChange={(e) => set("businessEmail", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Service Type">
              <select value={draft.serviceType} onChange={(e) => set("serviceType", e.target.value as AgreementServiceType)} className={inputClass}>
                {AGREEMENT_SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {AGREEMENT_SERVICE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target Type">
              <select value={draft.targetType} onChange={(e) => set("targetType", e.target.value as AgreementTargetType)} className={inputClass}>
                {AGREEMENT_TARGET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "guaranteed" ? "Guaranteed" : "Monthly Target"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Agreed Monthly Target">
              <input type="number" min={1} value={draft.monthlyTarget} onChange={(e) => set("monthlyTarget", Number(e.target.value))} className={inputClass} />
            </Field>
            <Field label="Monthly Fee">
              <input type="number" min={0} step="0.01" value={draft.monthlyFee} onChange={(e) => set("monthlyFee", Number(e.target.value))} className={inputClass} />
            </Field>
            <Field label="Setup Fee (if applicable)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.setupFee ?? ""}
                onChange={(e) => set("setupFee", e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
              />
            </Field>
            <Field label="Target Industries (comma-separated)">
              <input
                value={draft.targetIndustries.join(", ")}
                onChange={(e) => set("targetIndustries", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                className={inputClass}
              />
            </Field>
            <Field label="Target Cities, Provinces or Countries (comma-separated)">
              <input
                value={draft.targetLocations.join(", ")}
                onChange={(e) => set("targetLocations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                className={inputClass}
              />
            </Field>
            <Field label="Campaign Start Date">
              <input type="date" value={draft.campaignStartDate ?? ""} onChange={(e) => set("campaignStartDate", e.target.value || null)} className={inputClass} />
            </Field>
            <Field label="Billing Frequency">
              <select value={draft.billingFrequency} onChange={(e) => set("billingFrequency", e.target.value as AgreementBillingFrequency)} className={inputClass}>
                {AGREEMENT_BILLING_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment Due Terms">
              <input placeholder="e.g. Net 15" value={draft.paymentDueTerms ?? ""} onChange={(e) => set("paymentDueTerms", e.target.value || null)} className={inputClass} />
            </Field>
            <Field label="Initial Agreement Term">
              <input value={draft.initialTerm ?? ""} onChange={(e) => set("initialTerm", e.target.value || null)} className={inputClass} />
            </Field>
            <Field label="Renewal Terms">
              <input value={draft.renewalTerms ?? ""} onChange={(e) => set("renewalTerms", e.target.value || null)} className={inputClass} />
            </Field>
            <Field label="Cancellation Terms">
              <input value={draft.cancellationTerms ?? ""} onChange={(e) => set("cancellationTerms", e.target.value || null)} className={inputClass} />
            </Field>
          </div>
          <Field label="Additional Notes">
            <textarea value={draft.additionalNotes ?? ""} onChange={(e) => set("additionalNotes", e.target.value || null)} rows={3} className={`${inputClass} resize-y`} />
          </Field>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => updateAgreementDraftAction(agreement.id, draft))}
              className={buttonClasses}
            >
              {isPending ? "Saving…" : "Save Draft"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
              Preview Instead
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Agreement Preview</h2>
            {agreement.status === "draft" && (
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                Edit Draft
              </button>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Info label="Contact" value={`${agreement.contact_person} — ${agreement.business_email}`} />
            <Info label="Service Type" value={AGREEMENT_SERVICE_TYPE_LABELS[agreement.service_type]} />
            <Info label="Monthly Fee" value={`$${agreement.monthly_fee.toLocaleString()}`} />
            <Info label="Setup Fee" value={agreement.setup_fee ? `$${agreement.setup_fee.toLocaleString()}` : "None"} />
            <Info label="Campaign Start Date" value={agreement.campaign_start_date ?? "-"} />
            <Info label="Billing Frequency" value={agreement.billing_frequency} />
          </dl>

          <div className="mt-6 space-y-4">
            {sections.map((section) => (
              <div key={section.key}>
                <h3 className="text-[14px] font-bold text-slate-900">{section.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{section.body}</p>
              </div>
            ))}
          </div>

          {agreement.status === "draft" && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-start gap-2 text-[13.5px] text-slate-700">
                <input type="checkbox" checked={reviewedConfirmation} onChange={(e) => setReviewedConfirmation(e.target.checked)} className="mt-0.5" />
                <span>I have reviewed the price, monthly target and agreement terms.</span>
              </label>
              <button
                type="button"
                disabled={isPending || !reviewedConfirmation}
                onClick={() => runAction(() => sendAgreementAction(agreement.id, reviewedConfirmation))}
                className={`${buttonClasses} mt-3`}
              >
                {isPending ? "Sending…" : "Send Agreement"}
              </button>
            </div>
          )}

          {agreement.status === "sent" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!confirm("Resend the agreement email? The client will receive another copy of the sign-link.")) return;
                runAction(() => resendAgreementAction(agreement.id));
              }}
              className={`${buttonClasses} mt-6`}
            >
              Resend Agreement
            </button>
          )}

          {agreement.status === "signed" && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href={`/admin/crm/agreements/${agreement.id}/pdf`} target="_blank" rel="noopener noreferrer" className={buttonClasses}>
                Download Signed Agreement
              </a>
              {intakeConfigId ? (
                <Link href={`/admin/crm/intake/${intakeConfigId}`} className="text-sm font-semibold text-sky-600 hover:text-sky-700">
                  Go to Client Intake Form →
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    runAction(async () => {
                      const result = await getOrCreateIntakeConfigAction(agreement.id);
                      if (result.error) return { error: result.error };
                      router.push(`/admin/crm/intake/${result.configId}`);
                      return {};
                    })
                  }
                  className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                >
                  Create Client Intake Form
                </button>
              )}
            </div>
          )}

          {agreement.status === "signed" && hasSubmission && !invoice && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              {!showRecordInvoice ? (
                <button type="button" onClick={() => setShowRecordInvoice(true)} className={buttonClasses}>
                  Record Invoice
                </button>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Record Invoice</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Invoice Number">
                      <input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceNumber: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Invoice Amount">
                      <input
                        type="number"
                        step="0.01"
                        value={invoiceForm.invoiceAmount}
                        onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceAmount: e.target.value }))}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Date Sent">
                      <input type="date" value={invoiceForm.dateSent} onChange={(e) => setInvoiceForm((p) => ({ ...p, dateSent: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Payment Due Date">
                      <input
                        type="date"
                        value={invoiceForm.paymentDueDate}
                        onChange={(e) => setInvoiceForm((p) => ({ ...p, paymentDueDate: e.target.value }))}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    disabled={isPending || !invoiceForm.invoiceNumber.trim()}
                    onClick={() =>
                      runAction(() =>
                        recordAgreementInvoiceAction(agreement.id, {
                          invoiceNumber: invoiceForm.invoiceNumber,
                          invoiceAmount: Number(invoiceForm.invoiceAmount),
                          dateSent: invoiceForm.dateSent || null,
                          paymentDueDate: invoiceForm.paymentDueDate || null,
                        })
                      )
                    }
                    className={buttonClasses}
                  >
                    {isPending ? "Saving…" : "Save Invoice"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-base font-bold text-slate-900">Audit Trail</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {events.map((event) => (
            <li key={event.id}>
              <span className="font-semibold capitalize text-slate-800">{event.event_type}</span> — {new Date(event.occurred_at).toLocaleString()} ({event.actor_type})
            </li>
          ))}
          {events.length === 0 && <li className="text-slate-400">No events yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12.5px] font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

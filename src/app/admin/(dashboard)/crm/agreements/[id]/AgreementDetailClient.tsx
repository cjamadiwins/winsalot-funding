"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  updateAgreementDraftAction,
  sendAgreementAction,
  resendAgreementAction,
  recordAgreementInvoiceAction,
  activatePilotAction,
  startPilotResultsReviewAction,
  savePilotResultsAction,
  convertPilotToPaidCampaignAction,
  extendPilotAction,
  closePilotAction,
  type AgreementDraftInput,
  type PilotResultsInput,
  type ConvertPilotInput,
  type ExtendPilotInput,
} from "../actions";
import { getOrCreateIntakeConfigAction } from "../../intake/[id]/actions";
import {
  AGREEMENT_SERVICE_TYPES,
  AGREEMENT_SERVICE_TYPE_LABELS,
  AGREEMENT_TARGET_TYPES,
  AGREEMENT_BILLING_FREQUENCIES,
  COMPLIMENTARY_PILOT_PROGRAM_LABEL,
  type AgreementServiceType,
  type AgreementTargetType,
  type AgreementBillingFrequency,
  type CrmClientAgreementRow,
  type CrmAgreementEventRow,
  type CrmAgreementInvoiceRow,
  type CrmPilotResultsRow,
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
    pilotDuration: a.pilot_duration,
    pilotEndDate: a.pilot_end_date,
    expectedCallVolume: a.expected_call_volume,
    qualificationCriteria: a.qualification_criteria,
    resultsReviewDate: a.results_review_date,
  };
}

export default function AgreementDetailClient({
  agreement,
  sections,
  events,
  intakeConfigId,
  hasSubmission,
  invoice,
  openRecordInvoice,
  pilotResults,
}: {
  agreement: CrmClientAgreementRow;
  sections: RenderedAgreementSection[];
  events: CrmAgreementEventRow[];
  intakeConfigId: string | null;
  hasSubmission: boolean;
  invoice: CrmAgreementInvoiceRow | null;
  openRecordInvoice: boolean;
  pilotResults: CrmPilotResultsRow | null;
}) {
  const router = useRouter();
  const isPilot = agreement.campaign_type === "free_pilot";
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
  const [resultsForm, setResultsForm] = useState({
    callsCompleted: pilotResults?.calls_completed?.toString() ?? "",
    decisionMakersReached: pilotResults?.decision_makers_reached?.toString() ?? "",
    interestedProspects: pilotResults?.interested_prospects?.toString() ?? "",
    informationEmailsSent: pilotResults?.information_emails_sent?.toString() ?? "",
    qualifiedLeads: pilotResults?.qualified_leads?.toString() ?? "",
    appointmentsBooked: pilotResults?.appointments_booked?.toString() ?? "",
    commonObjections: pilotResults?.common_objections ?? "",
    marketResponse: pilotResults?.market_response ?? "",
    adminRecommendation: pilotResults?.admin_recommendation ?? "",
  });
  const [convertForm, setConvertForm] = useState({ monthlyFee: "", setupFee: "", monthlyTarget: "", campaignStartDate: "", billingFrequency: "monthly" as AgreementBillingFrequency, paymentDueTerms: "" });
  const [extendForm, setExtendForm] = useState({ newEndDate: "", newTarget: "" });
  const [pilotAction, setPilotAction] = useState<"convert" | "extend" | "close" | null>(null);

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
        <div className="flex items-center gap-2">
          {isPilot && <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{COMPLIMENTARY_PILOT_PROGRAM_LABEL}</span>}
          <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold capitalize text-indigo-800">{agreement.status}</span>
        </div>
      </div>
      <p className="text-sm text-slate-500">
        Version {agreement.version}
        {isPilot && <span className="ml-2 capitalize text-slate-400">· Pilot status: {agreement.pilot_status.replace(/_/g, " ")}</span>}
      </p>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

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
            <Field label={isPilot ? "Pilot Target (Qualified Leads/Appointments)" : "Agreed Monthly Target"}>
              <input type="number" min={1} value={draft.monthlyTarget} onChange={(e) => set("monthlyTarget", Number(e.target.value))} className={inputClass} />
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
            <Field label="Start Date">
              <input type="date" value={draft.campaignStartDate ?? ""} onChange={(e) => set("campaignStartDate", e.target.value || null)} className={inputClass} />
            </Field>

            {isPilot ? (
              <>
                <Field label="Pilot Duration (e.g. 6 weeks)">
                  <input value={draft.pilotDuration ?? ""} onChange={(e) => set("pilotDuration", e.target.value || null)} className={inputClass} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={draft.pilotEndDate ?? ""} onChange={(e) => set("pilotEndDate", e.target.value || null)} className={inputClass} />
                </Field>
                <Field label="Expected Call Volume or Lead-List Size">
                  <input value={draft.expectedCallVolume ?? ""} onChange={(e) => set("expectedCallVolume", e.target.value || null)} className={inputClass} />
                </Field>
                <Field label="Qualification Criteria">
                  <input value={draft.qualificationCriteria ?? ""} onChange={(e) => set("qualificationCriteria", e.target.value || null)} className={inputClass} />
                </Field>
                <Field label="Results-Review Date">
                  <input type="date" value={draft.resultsReviewDate ?? ""} onChange={(e) => set("resultsReviewDate", e.target.value || null)} className={inputClass} />
                </Field>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
          {isPilot && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800">
              {COMPLIMENTARY_PILOT_PROGRAM_LABEL} — Pilot Fee: $0 · Setup Fee: $0
            </p>
          )}
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
            {isPilot ? (
              <>
                <Info label="Pilot Fee" value="$0" />
                <Info label="Setup Fee" value="$0" />
                <Info label="Start Date" value={agreement.campaign_start_date ?? "-"} />
                <Info label="End Date" value={agreement.pilot_end_date ?? "-"} />
                <Info label="Pilot Duration" value={agreement.pilot_duration ?? "-"} />
                <Info label="Results-Review Date" value={agreement.results_review_date ?? "-"} />
                <Info label="Expected Call Volume / Lead-List Size" value={agreement.expected_call_volume ?? "-"} />
                <Info label="Qualification Criteria" value={agreement.qualification_criteria ?? "-"} />
              </>
            ) : (
              <>
                <Info label="Monthly Fee" value={`$${agreement.monthly_fee.toLocaleString()}`} />
                <Info label="Setup Fee" value={agreement.setup_fee ? `$${agreement.setup_fee.toLocaleString()}` : "None"} />
                <Info label="Campaign Start Date" value={agreement.campaign_start_date ?? "-"} />
                <Info label="Billing Frequency" value={agreement.billing_frequency} />
              </>
            )}
          </dl>
          {isPilot && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800">
              {COMPLIMENTARY_PILOT_PROGRAM_LABEL} — Pilot Fee: $0 · Setup Fee: $0
            </p>
          )}

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

          {isPilot && agreement.status === "signed" && hasSubmission && agreement.pilot_status === "not_started" && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!confirm("Activate this pilot?")) return;
                  runAction(() => activatePilotAction(agreement.id));
                }}
                className={buttonClasses}
              >
                {isPending ? "Activating…" : "Activate Pilot"}
              </button>
            </div>
          )}

          {isPilot && agreement.pilot_status === "active" && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => startPilotResultsReviewAction(agreement.id))}
                className={buttonClasses}
              >
                {isPending ? "Saving…" : "Start Results Review"}
              </button>
            </div>
          )}

          {isPilot && agreement.pilot_status === "results_review" && (
            <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-900">Results Review — Choose Next Step</h3>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setPilotAction(pilotAction === "convert" ? null : "convert")} className={buttonClasses}>
                  Convert to Paid Monthly Campaign
                </button>
                <button type="button" onClick={() => setPilotAction(pilotAction === "extend" ? null : "extend")} className={buttonClasses}>
                  Extend Pilot
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (!confirm("Close this pilot? It will be preserved but marked closed.")) return;
                    runAction(() => closePilotAction(agreement.id));
                  }}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close Pilot
                </button>
              </div>

              {pilotAction === "convert" && (
                <div className="space-y-3 border-t border-slate-200 pt-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Monthly Fee">
                      <input type="number" min={0} step="0.01" value={convertForm.monthlyFee} onChange={(e) => setConvertForm((p) => ({ ...p, monthlyFee: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Setup Fee (if applicable)">
                      <input type="number" min={0} step="0.01" value={convertForm.setupFee} onChange={(e) => setConvertForm((p) => ({ ...p, setupFee: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Agreed Monthly Target">
                      <input type="number" min={1} value={convertForm.monthlyTarget} onChange={(e) => setConvertForm((p) => ({ ...p, monthlyTarget: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Campaign Start Date">
                      <input type="date" value={convertForm.campaignStartDate} onChange={(e) => setConvertForm((p) => ({ ...p, campaignStartDate: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="Billing Frequency">
                      <select
                        value={convertForm.billingFrequency}
                        onChange={(e) => setConvertForm((p) => ({ ...p, billingFrequency: e.target.value as AgreementBillingFrequency }))}
                        className={inputClass}
                      >
                        {AGREEMENT_BILLING_FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Payment Due Terms">
                      <input placeholder="e.g. Net 15" value={convertForm.paymentDueTerms} onChange={(e) => setConvertForm((p) => ({ ...p, paymentDueTerms: e.target.value }))} className={inputClass} />
                    </Field>
                  </div>
                  <button
                    type="button"
                    disabled={isPending || !convertForm.monthlyFee || !convertForm.monthlyTarget}
                    onClick={() =>
                      runAction(async () => {
                        const input: ConvertPilotInput = {
                          monthlyFee: Number(convertForm.monthlyFee),
                          setupFee: convertForm.setupFee ? Number(convertForm.setupFee) : null,
                          monthlyTarget: Number(convertForm.monthlyTarget),
                          campaignStartDate: convertForm.campaignStartDate || null,
                          billingFrequency: convertForm.billingFrequency,
                          paymentDueTerms: convertForm.paymentDueTerms || null,
                        };
                        const result = await convertPilotToPaidCampaignAction(agreement.id, input);
                        if (result.error) return { error: result.error };
                        router.push(`/admin/crm/agreements/${result.agreementId}`);
                        return {};
                      })
                    }
                    className={buttonClasses}
                  >
                    {isPending ? "Converting…" : "Create Paid Campaign Agreement"}
                  </button>
                </div>
              )}

              {pilotAction === "extend" && (
                <div className="space-y-3 border-t border-slate-200 pt-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="New End Date">
                      <input type="date" value={extendForm.newEndDate} onChange={(e) => setExtendForm((p) => ({ ...p, newEndDate: e.target.value }))} className={inputClass} />
                    </Field>
                    <Field label="New Pilot Target">
                      <input type="number" min={1} value={extendForm.newTarget} onChange={(e) => setExtendForm((p) => ({ ...p, newTarget: e.target.value }))} className={inputClass} />
                    </Field>
                  </div>
                  <button
                    type="button"
                    disabled={isPending || !extendForm.newEndDate || !extendForm.newTarget}
                    onClick={() =>
                      runAction(async () => {
                        const input: ExtendPilotInput = { newEndDate: extendForm.newEndDate, newTarget: Number(extendForm.newTarget) };
                        const result = await extendPilotAction(agreement.id, input);
                        if (result.error) return { error: result.error };
                        router.push(`/admin/crm/agreements/${result.agreementId}`);
                        return {};
                      })
                    }
                    className={buttonClasses}
                  >
                    {isPending ? "Extending…" : "Create Extended Pilot Agreement"}
                  </button>
                </div>
              )}
            </div>
          )}

          {isPilot && (agreement.pilot_status === "active" || agreement.pilot_status === "results_review" || agreement.pilot_status === "converted" || agreement.pilot_status === "extended" || agreement.pilot_status === "closed") && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-900">Pilot Results Dashboard</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Calls Completed">
                  <input type="number" min={0} value={resultsForm.callsCompleted} onChange={(e) => setResultsForm((p) => ({ ...p, callsCompleted: e.target.value }))} className={inputClass} />
                </Field>
                <Field label="Decision-Makers Reached">
                  <input type="number" min={0} value={resultsForm.decisionMakersReached} onChange={(e) => setResultsForm((p) => ({ ...p, decisionMakersReached: e.target.value }))} className={inputClass} />
                </Field>
                <Field label="Interested Prospects">
                  <input type="number" min={0} value={resultsForm.interestedProspects} onChange={(e) => setResultsForm((p) => ({ ...p, interestedProspects: e.target.value }))} className={inputClass} />
                </Field>
                <Field label="Information Emails Sent">
                  <input type="number" min={0} value={resultsForm.informationEmailsSent} onChange={(e) => setResultsForm((p) => ({ ...p, informationEmailsSent: e.target.value }))} className={inputClass} />
                </Field>
                <Field label="Qualified Leads">
                  <input type="number" min={0} value={resultsForm.qualifiedLeads} onChange={(e) => setResultsForm((p) => ({ ...p, qualifiedLeads: e.target.value }))} className={inputClass} />
                </Field>
                <Field label="Appointments Booked">
                  <input type="number" min={0} value={resultsForm.appointmentsBooked} onChange={(e) => setResultsForm((p) => ({ ...p, appointmentsBooked: e.target.value }))} className={inputClass} />
                </Field>
              </div>
              <Field label="Common Objections">
                <textarea
                  value={resultsForm.commonObjections}
                  onChange={(e) => setResultsForm((p) => ({ ...p, commonObjections: e.target.value }))}
                  rows={2}
                  className={`${inputClass} mt-1 resize-y`}
                />
              </Field>
              <Field label="Market Response">
                <textarea
                  value={resultsForm.marketResponse}
                  onChange={(e) => setResultsForm((p) => ({ ...p, marketResponse: e.target.value }))}
                  rows={2}
                  className={`${inputClass} mt-1 resize-y`}
                />
              </Field>
              <Field label="Admin Recommendation">
                <textarea
                  value={resultsForm.adminRecommendation}
                  onChange={(e) => setResultsForm((p) => ({ ...p, adminRecommendation: e.target.value }))}
                  rows={2}
                  className={`${inputClass} mt-1 resize-y`}
                />
              </Field>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runAction(() => {
                    const toNum = (v: string) => (v.trim() === "" ? null : Number(v));
                    const input: PilotResultsInput = {
                      callsCompleted: toNum(resultsForm.callsCompleted),
                      decisionMakersReached: toNum(resultsForm.decisionMakersReached),
                      interestedProspects: toNum(resultsForm.interestedProspects),
                      informationEmailsSent: toNum(resultsForm.informationEmailsSent),
                      qualifiedLeads: toNum(resultsForm.qualifiedLeads),
                      appointmentsBooked: toNum(resultsForm.appointmentsBooked),
                      commonObjections: resultsForm.commonObjections || null,
                      marketResponse: resultsForm.marketResponse || null,
                      adminRecommendation: resultsForm.adminRecommendation || null,
                    };
                    return savePilotResultsAction(agreement.id, input);
                  })
                }
                className={`${buttonClasses} mt-3`}
              >
                {isPending ? "Saving…" : "Save Pilot Results"}
              </button>
            </div>
          )}

          {!isPilot && agreement.status === "signed" && hasSubmission && !invoice && (
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

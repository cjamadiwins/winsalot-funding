"use client";

import { useState, useTransition } from "react";
import {
  ARRANGEMENT_CAMPAIGN_STATUSES,
  ARRANGEMENT_CAMPAIGN_STATUS_LABELS,
  ARRANGEMENT_CONVERSION_STATUSES,
  ARRANGEMENT_CONVERSION_STATUS_LABELS,
  ARRANGEMENT_FEE_STATUSES,
  ARRANGEMENT_FEE_STATUS_LABELS,
  ARRANGEMENT_INTERNAL_COMPLIANCE_NOTE,
  ARRANGEMENT_TYPES,
  ARRANGEMENT_TYPE_LABELS,
  formatArrangementBanner,
  type ArrangementType,
  type OpportunityCommercialArrangement,
} from "@/lib/commercial-arrangement";

const inputClasses =
  "w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelClasses = "text-[12px] font-semibold text-slate-700";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-slate-900">{value || "—"}</dd>
    </div>
  );
}

// Business record's "Commercial Arrangement" section - the same field set
// Section 9 of the Client Consultation Guide captures, on whichever
// crm_opportunities row it was saved to. Two modes, one component so the
// two screens can never drift on what's shown:
//   * editable (Admin's opportunity detail page): a save form for every
//     arrangement_* field, plus the admin-only "Mark as Converted" button.
//   * read-only (Agent's opportunity detail page, editable=false, no
//     actions passed): plain text display only - "Agents may VIEW the
//     campaign arrangement and targeting instructions if needed, but must
//     not be able to edit financial or agreement terms."
export default function CommercialArrangementPanel({
  opportunityId,
  opportunity,
  editable,
  updateAction,
  markConvertedAction,
}: {
  opportunityId: string;
  opportunity: OpportunityCommercialArrangement;
  editable: boolean;
  updateAction?: (opportunityId: string, formData: FormData) => Promise<{ error?: string }>;
  markConvertedAction?: (opportunityId: string, convertedBusiness: string) => Promise<{ error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [arrangementType, setArrangementType] = useState<ArrangementType>(opportunity.arrangement_type);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertedBusiness, setConvertedBusiness] = useState("");

  const banner = formatArrangementBanner(opportunity);
  const alreadyConverted = opportunity.arrangement_conversion_status === "converted";

  function handleSave(formData: FormData) {
    if (!updateAction) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateAction(opportunityId, formData);
      if (result.error) setError(result.error);
      else setMessage("Commercial arrangement saved.");
    });
  }

  function handleMarkConverted() {
    if (!markConvertedAction) return;
    if (!convertedBusiness.trim()) {
      setError("Enter the name of the converted customer/business.");
      return;
    }
    if (!confirm(`Mark this business as Converted? This sets the $${opportunity.arrangement_standard_fee} Winsalot fee to Due and cannot be undone.`)) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await markConvertedAction(opportunityId, convertedBusiness.trim());
      if (result.error) setError(result.error);
      else {
        setMessage("Marked as Converted. Fee status set to Due.");
        setShowConvertForm(false);
        setConvertedBusiness("");
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Commercial Arrangement</h2>

      {banner && (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13.5px] font-bold text-sky-900">{banner}</p>
      )}

      {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">{error}</p>}
      {message && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">{message}</p>}

      {editable && updateAction ? (
        <form action={handleSave} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelClasses}>Arrangement Type</span>
              <select
                name="arrangement_type"
                value={arrangementType}
                onChange={(e) => setArrangementType(e.target.value as ArrangementType)}
                className={inputClasses}
              >
                {ARRANGEMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {ARRANGEMENT_TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            {arrangementType !== "standard_monthly" && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Standard Fee</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-slate-500">$</span>
                    <input type="number" min={0} step="0.01" name="arrangement_standard_fee" defaultValue={opportunity.arrangement_standard_fee} className={inputClasses} />
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Upfront Payment</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-slate-500">$</span>
                    <input type="number" min={0} step="0.01" name="arrangement_upfront_payment" defaultValue={opportunity.arrangement_upfront_payment} className={inputClasses} />
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Payment Trigger</span>
                  <input name="arrangement_payment_trigger" defaultValue={opportunity.arrangement_payment_trigger ?? ""} className={inputClasses} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Attribution Period</span>
                  <input name="arrangement_attribution_period" defaultValue={opportunity.arrangement_attribution_period ?? ""} className={inputClasses} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Service</span>
                  <input name="arrangement_service" defaultValue={opportunity.arrangement_service ?? ""} className={inputClasses} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Campaign Status</span>
                  <select name="arrangement_campaign_status" defaultValue={opportunity.arrangement_campaign_status ?? "pending_agreement"} className={inputClasses}>
                    {ARRANGEMENT_CAMPAIGN_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {ARRANGEMENT_CAMPAIGN_STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Conversion Status</span>
                  <select name="arrangement_conversion_status" defaultValue={opportunity.arrangement_conversion_status ?? "not_converted"} className={inputClasses}>
                    {ARRANGEMENT_CONVERSION_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {ARRANGEMENT_CONVERSION_STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Fee Status</span>
                  <select name="arrangement_fee_status" defaultValue={opportunity.arrangement_fee_status ?? "not_due"} className={inputClasses}>
                    {ARRANGEMENT_FEE_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {ARRANGEMENT_FEE_STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          {arrangementType !== "standard_monthly" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Client Services Being Promoted</span>
                <textarea name="arrangement_client_services" defaultValue={opportunity.arrangement_client_services ?? ""} className={`${inputClasses} min-h-[60px] resize-y`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Special Terms</span>
                <textarea name="arrangement_special_terms" defaultValue={opportunity.arrangement_special_terms ?? ""} className={`${inputClasses} min-h-[70px] resize-y`} />
              </label>
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] font-semibold text-amber-900">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Internal Only — Never sent to clients</p>
                <p className="mt-1">{ARRANGEMENT_INTERNAL_COMPLIANCE_NOTE}</p>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Arrangement
          </button>
        </form>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Arrangement Type" value={ARRANGEMENT_TYPE_LABELS[opportunity.arrangement_type]} />
          {opportunity.arrangement_type !== "standard_monthly" && (
            <>
              <Field label="Standard Fee" value={`$${opportunity.arrangement_standard_fee}`} />
              <Field label="Upfront Payment" value={`$${opportunity.arrangement_upfront_payment}`} />
              <Field label="Payment Trigger" value={opportunity.arrangement_payment_trigger} />
              <Field label="Attribution Period" value={opportunity.arrangement_attribution_period} />
              <Field label="Campaign Status" value={opportunity.arrangement_campaign_status ? ARRANGEMENT_CAMPAIGN_STATUS_LABELS[opportunity.arrangement_campaign_status] : null} />
              <Field label="Conversion Status" value={opportunity.arrangement_conversion_status ? ARRANGEMENT_CONVERSION_STATUS_LABELS[opportunity.arrangement_conversion_status] : null} />
              <Field label="Fee Status" value={opportunity.arrangement_fee_status ? ARRANGEMENT_FEE_STATUS_LABELS[opportunity.arrangement_fee_status] : null} />
              <Field label="Conversion Date" value={opportunity.arrangement_conversion_date ? new Date(opportunity.arrangement_conversion_date).toLocaleDateString() : null} />
              <Field label="Converted Business / Customer" value={opportunity.arrangement_converted_business} />
              <div className="sm:col-span-2">
                <Field label="Client Services Being Promoted" value={opportunity.arrangement_client_services} />
              </div>
              <div className="sm:col-span-2">
                <Field label="Special Terms" value={opportunity.arrangement_special_terms} />
              </div>
            </>
          )}
        </dl>
      )}

      {editable && arrangementType !== "standard_monthly" && markConvertedAction && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          {alreadyConverted ? (
            <div className="text-[13px] text-slate-600">
              <Field label="Conversion Date" value={opportunity.arrangement_conversion_date ? new Date(opportunity.arrangement_conversion_date).toLocaleDateString() : null} />
              <div className="mt-2">
                <Field label="Converted Business / Customer" value={opportunity.arrangement_converted_business} />
              </div>
            </div>
          ) : !showConvertForm ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowConvertForm(true)}
              className="rounded-[11px] bg-emerald-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mark as Converted
            </button>
          ) : (
            <div className="space-y-2.5">
              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Converted Customer / Business Name</span>
                <input value={convertedBusiness} onChange={(e) => setConvertedBusiness(e.target.value)} className={`${inputClasses} sm:max-w-sm`} />
              </label>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleMarkConverted}
                  className="rounded-[11px] bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Confirm Conversion
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConvertForm(false);
                    setConvertedBusiness("");
                  }}
                  className="rounded-[11px] border border-slate-300 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 transition hover:border-slate-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

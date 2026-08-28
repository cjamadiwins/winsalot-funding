"use client";

import { useState, useTransition } from "react";
import { updateOnboardingRecordAction, type ManageOnboardingRecordInput } from "../agreements/actions";
import {
  AGREEMENT_SERVICE_TYPES,
  AGREEMENT_SERVICE_TYPE_LABELS,
  AGREEMENT_CURRENCIES,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
  CLIENT_MANUAL_STATUSES,
  type AgreementServiceType,
  type AgreementCurrency,
  type CampaignType,
  type ClientManualStatus,
} from "@/lib/crm-agreement-types";
import type { ManageFields } from "./OnboardingDashboardClient";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses = "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function ManageOnboardingRecordModal({
  agreementId,
  clientName,
  manage,
  onClose,
}: {
  agreementId: string;
  clientName: string;
  manage: ManageFields;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    legalBusinessName: manage.legalBusinessName,
    contactPerson: manage.contactPerson,
    businessEmail: manage.businessEmail,
    phone: manage.phone ?? "",
    manualStatus: manage.manualStatus ?? ("Draft" as ClientManualStatus),
    additionalNotes: manage.additionalNotes ?? "",
    serviceType: manage.serviceType,
    campaignType: manage.campaignType,
    monthlyTarget: String(manage.monthlyTarget),
    monthlyFee: String(manage.monthlyFee),
    setupFee: manage.setupFee !== null ? String(manage.setupFee) : "",
    currency: manage.currency,
    campaignStartDate: manage.campaignStartDate ?? "",
    pilotEndDate: manage.pilotEndDate ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const input: ManageOnboardingRecordInput = {
        legalBusinessName: form.legalBusinessName,
        contactPerson: form.contactPerson,
        businessEmail: form.businessEmail,
        phone: form.phone || null,
        manualStatus: form.manualStatus,
        additionalNotes: form.additionalNotes || null,
        serviceType: form.serviceType as AgreementServiceType,
        campaignType: form.campaignType as CampaignType,
        monthlyTarget: Number(form.monthlyTarget),
        monthlyFee: Number(form.monthlyFee),
        setupFee: form.setupFee ? Number(form.setupFee) : null,
        currency: form.currency as AgreementCurrency,
        campaignStartDate: form.campaignStartDate || null,
        pilotEndDate: form.pilotEndDate || null,
      };
      const result = await updateOnboardingRecordAction(agreementId, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const isPilot = form.campaignType === "free_pilot";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Manage — {clientName}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}

        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Business Name">
              <input value={form.legalBusinessName} onChange={(e) => set("legalBusinessName", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contact Name">
              <input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Email Address">
              <input type="email" value={form.businessEmail} onChange={(e) => set("businessEmail", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Phone Number">
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Client Status">
              <select value={form.manualStatus} onChange={(e) => set("manualStatus", e.target.value as ClientManualStatus)} className={inputClass}>
                {CLIENT_MANUAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {manage.isLocked && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
              This record has been signed. Program type, service, pilot dates/goal, and price/currency are locked — use Convert/Extend on the
              agreement to change them.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Service Selected">
              {manage.isLocked ? (
                <ReadOnly value={AGREEMENT_SERVICE_TYPE_LABELS[form.serviceType as AgreementServiceType]} />
              ) : (
                <select value={form.serviceType} onChange={(e) => set("serviceType", e.target.value as AgreementServiceType)} className={inputClass}>
                  {AGREEMENT_SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {AGREEMENT_SERVICE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Program Type">
              {manage.isLocked ? (
                <ReadOnly value={CAMPAIGN_TYPE_LABELS[form.campaignType as CampaignType]} />
              ) : (
                <select value={form.campaignType} onChange={(e) => set("campaignType", e.target.value as CampaignType)} className={inputClass}>
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CAMPAIGN_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={isPilot ? "Pilot Goal (Leads/Appointments)" : "Monthly Target"}>
              {manage.isLocked ? <ReadOnly value={form.monthlyTarget} /> : <input type="number" min={1} value={form.monthlyTarget} onChange={(e) => set("monthlyTarget", e.target.value)} className={inputClass} />}
            </Field>
            <Field label="Pilot Start Date / Campaign Start Date">
              {manage.isLocked ? (
                <ReadOnly value={form.campaignStartDate || "-"} />
              ) : (
                <input type="date" value={form.campaignStartDate} onChange={(e) => set("campaignStartDate", e.target.value)} className={inputClass} />
              )}
            </Field>
            {isPilot && (
              <Field label="Pilot End Date">
                {manage.isLocked ? (
                  <ReadOnly value={form.pilotEndDate || "-"} />
                ) : (
                  <input type="date" value={form.pilotEndDate} onChange={(e) => set("pilotEndDate", e.target.value)} className={inputClass} />
                )}
              </Field>
            )}
            {!isPilot && (
              <>
                <Field label="Monthly Price">
                  {manage.isLocked ? <ReadOnly value={`$${form.monthlyFee}`} /> : <input type="number" min={0} step="0.01" value={form.monthlyFee} onChange={(e) => set("monthlyFee", e.target.value)} className={inputClass} />}
                </Field>
                <Field label="Currency">
                  {manage.isLocked ? (
                    <ReadOnly value={form.currency} />
                  ) : (
                    <select value={form.currency} onChange={(e) => set("currency", e.target.value as AgreementCurrency)} className={inputClass}>
                      {AGREEMENT_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </>
            )}
          </div>

          <Field label="Notes">
            <textarea value={form.additionalNotes} onChange={(e) => set("additionalNotes", e.target.value)} rows={3} className={`${inputClass} resize-y`} />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button type="button" disabled={isPending} onClick={handleSave} className={buttonClasses}>
            {isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
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

function ReadOnly({ value }: { value: string }) {
  return <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500">{value}</p>;
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  SUBCONTRACTOR_AUDIT_ACTION_LABELS,
  SUBCONTRACTOR_CRM_ACCESS_LABELS,
  SUBCONTRACTOR_CRM_ACCESS_OPTIONS,
  SUBCONTRACTOR_STATUSES,
  SUBCONTRACTOR_STATUS_BADGE_CLASSES,
  SUBCONTRACTOR_STATUS_LABELS,
  SUBCONTRACTOR_TRAINING_STATUS_LABELS,
  canActivateSubcontractor,
  type SubcontractorAgreementRow,
  type SubcontractorAuditLogRow,
  type SubcontractorClientAssignmentRow,
  type SubcontractorOnboardingItem,
  type SubcontractorPermissionsRow,
  type SubcontractorProfileRow,
  type SubcontractorTrainingModuleRow,
  type SubcontractorTrainingProgressRow,
} from "@/lib/crm-subcontractor-types";
import {
  formatSubcontractorCurrency,
  SUBCONTRACTOR_CURRENCIES,
  SUBCONTRACTOR_CURRENCY_LABELS,
  SUBCONTRACTOR_PAY_TYPES,
  SUBCONTRACTOR_PAY_TYPE_LABELS,
} from "@/lib/subcontractor-payroll";

type ActionResult = { error?: string };

type Props = {
  subcontractor: SubcontractorProfileRow;
  assignment: (SubcontractorClientAssignmentRow & { crm_clients: { company_name: string } | null }) | null;
  agreements: SubcontractorAgreementRow[];
  trainingModules: SubcontractorTrainingModuleRow[];
  trainingProgress: SubcontractorTrainingProgressRow[];
  permissions: SubcontractorPermissionsRow | null;
  clients: { id: string; company_name: string }[];
  crmAccessGranted: boolean;
  auditLog: SubcontractorAuditLogRow[];
  checklist: SubcontractorOnboardingItem[];
  progressSummary: string;
  updateProfileAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  setStatusAction: (subcontractorId: string, status: string, formData: FormData) => Promise<ActionResult>;
  changeAssignmentAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  updatePermissionsAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  grantCrmAccessAction: (subcontractorId: string) => Promise<ActionResult>;
  revokeCrmAccessAction: (subcontractorId: string) => Promise<ActionResult>;
  setTrainingRequiredOverrideAction: (subcontractorId: string, moduleId: string, requiredOverride: boolean | null) => Promise<ActionResult>;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function SubcontractorDetailClient({
  subcontractor,
  assignment,
  agreements,
  trainingModules,
  trainingProgress,
  permissions,
  clients,
  crmAccessGranted,
  auditLog,
  checklist,
  progressSummary,
  updateProfileAction,
  setStatusAction,
  changeAssignmentAction,
  updatePermissionsAction,
  grantCrmAccessAction,
  revokeCrmAccessAction,
  setTrainingRequiredOverrideAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [overrideOnboarding, setOverrideOnboarding] = useState(false);

  function runAction(fn: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  }

  const latestAgreement = agreements[0] ?? null;
  const canActivate = canActivateSubcontractor(checklist);
  const progressByModuleId = new Map(trainingProgress.map((p) => [p.module_id, p]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/crm/subcontractors" className="text-xs font-semibold text-sky-600 hover:text-sky-700">
            ← All Subcontractors
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{subcontractor.full_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {progressSummary} · Onboarding checklist below
          </p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${SUBCONTRACTOR_STATUS_BADGE_CLASSES[subcontractor.status]}`}>
          {SUBCONTRACTOR_STATUS_LABELS[subcontractor.status]}
        </span>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <Section title="Onboarding Checklist">
        <ul className="space-y-2 text-sm">
          {checklist.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span className={item.complete ? "text-emerald-600" : "text-slate-400"}>{item.complete ? "✓" : "○"}</span>
              <span className={item.complete ? "text-slate-700" : "text-slate-500"}>{item.label}</span>
            </li>
          ))}
        </ul>

        <form
          action={(formData) => runAction(() => setStatusAction(subcontractor.id, "active", formData))}
          className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4"
        >
          {!canActivate && (
            <label className="flex items-center gap-2 text-xs font-medium text-amber-800">
              <input type="checkbox" checked={overrideOnboarding} onChange={(e) => setOverrideOnboarding(e.target.checked)} />
              Override incomplete onboarding items
              <input type="hidden" name="override_onboarding" value={overrideOnboarding ? "true" : "false"} />
            </label>
          )}
          <button
            type="submit"
            disabled={isPending || subcontractor.status === "active" || (!canActivate && !overrideOnboarding)}
            className={buttonClasses}
          >
            Activate Subcontractor
          </button>
        </form>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-3">
          {SUBCONTRACTOR_STATUSES.filter((s) => s !== subcontractor.status).map((status) => (
            <form
              key={status}
              action={(formData) => runAction(() => setStatusAction(subcontractor.id, status, formData))}
              className="flex items-center gap-2"
            >
              {(status === "inactive" || status === "suspended" || status === "terminated") && (
                <input type="text" name="reason" placeholder="Reason" className="rounded border border-slate-300 px-2 py-1 text-xs" />
              )}
              <button type="submit" disabled={isPending} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                Set {SUBCONTRACTOR_STATUS_LABELS[status]}
              </button>
            </form>
          ))}
        </div>
      </Section>

      <Section title="Profile">
        {editingProfile ? (
          <form
            action={(formData) => runAction(() => updateProfileAction(subcontractor.id, formData), () => setEditingProfile(false))}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClasses}>Full Name</label>
                <input type="text" name="full_name" required defaultValue={subcontractor.full_name} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Email</label>
                <input type="email" name="email" defaultValue={subcontractor.email ?? ""} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Phone</label>
                <input type="text" name="phone" defaultValue={subcontractor.phone ?? ""} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Business Name</label>
                <input type="text" name="business_name" defaultValue={subcontractor.business_name ?? ""} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Country</label>
                <input type="text" name="country" defaultValue={subcontractor.country ?? ""} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Start Date</label>
                <input type="date" name="start_date" defaultValue={subcontractor.start_date ?? ""} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Currency</label>
                <select name="currency" required defaultValue={subcontractor.currency} className={`${inputClasses} mt-1`}>
                  {SUBCONTRACTOR_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {SUBCONTRACTOR_CURRENCY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClasses}>Pay Type</label>
                <select name="pay_type" required defaultValue={subcontractor.pay_type} className={`${inputClasses} mt-1`}>
                  {SUBCONTRACTOR_PAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SUBCONTRACTOR_PAY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClasses}>Pay Rate</label>
                <input type="number" name="pay_rate" min={0} step="0.01" defaultValue={subcontractor.pay_rate} className={`${inputClasses} mt-1`} />
              </div>
            </div>
            <div>
              <label className={labelClasses}>Notes</label>
              <textarea name="notes" rows={2} defaultValue={subcontractor.notes ?? ""} className={`${inputClasses} mt-1`} />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={isPending} className={buttonClasses}>
                Save Changes
              </button>
              <button type="button" onClick={() => setEditingProfile(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="font-medium text-slate-800">{subcontractor.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-800">{subcontractor.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Business Name</dt>
                <dd className="font-medium text-slate-800">{subcontractor.business_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Country</dt>
                <dd className="font-medium text-slate-800">{subcontractor.country ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Start Date</dt>
                <dd className="font-medium text-slate-800">{subcontractor.start_date ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Pay</dt>
                <dd className="font-medium text-slate-800">
                  {SUBCONTRACTOR_PAY_TYPE_LABELS[subcontractor.pay_type]} · {formatSubcontractorCurrency(subcontractor.pay_rate, subcontractor.currency)}
                </dd>
              </div>
            </dl>
            {subcontractor.notes && <p className="text-slate-500">{subcontractor.notes}</p>}
            <button type="button" onClick={() => setEditingProfile(true)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
              Edit Profile
            </button>
          </div>
        )}
      </Section>

      <Section title="Business/Client Assignment">
        <p className="text-sm text-slate-600">
          Current: <span className="font-semibold text-slate-900">{assignment?.crm_clients?.company_name ?? "Not assigned"}</span>
        </p>
        <form
          action={(formData) => runAction(() => changeAssignmentAction(subcontractor.id, formData))}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <select name="client_id" required defaultValue="" className={`${inputClasses} max-w-xs`}>
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          <input type="text" name="notes" placeholder="Optional note" className={`${inputClasses} max-w-xs`} />
          <button type="submit" disabled={isPending} className={buttonClasses}>
            {assignment ? "Change Assignment" : "Assign Client"}
          </button>
        </form>
      </Section>

      <Section title="Independent Contractor Agreement">
        {latestAgreement ? (
          <div className="text-sm">
            <p className="font-semibold text-emerald-700">Signed</p>
            <p className="mt-1 text-slate-600">
              Signed: {new Date(latestAgreement.accepted_at).toLocaleDateString()} · Version {latestAgreement.version.toFixed(1)} · Signed by{" "}
              {latestAgreement.contractor_name_typed}
            </p>
            <a
              href={`/admin/crm/subcontractors/${subcontractor.id}/agreement/pdf`}
              className="mt-2 inline-block text-xs font-semibold text-sky-600 hover:text-sky-700"
            >
              Download Agreement PDF
            </a>
          </div>
        ) : (
          <p className="text-sm text-amber-700">Not yet signed - the subcontractor signs this from their own portal once they have CRM access.</p>
        )}
      </Section>

      <Section title="Training">
        <ul className="space-y-2 text-sm">
          {trainingModules.map((module) => {
            const progress = progressByModuleId.get(module.id);
            const status = progress?.status ?? "not_started";
            const required = progress?.required_override ?? module.is_required;
            return (
              <li key={module.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5">
                <div>
                  <p className="font-medium text-slate-800">{module.title}</p>
                  <p className="text-xs text-slate-500">
                    {SUBCONTRACTOR_TRAINING_STATUS_LABELS[status]}
                    {progress?.completed_at && ` · Completed ${new Date(progress.completed_at).toLocaleDateString()}`}
                    {required ? " · Required" : " · Not required"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(() => setTrainingRequiredOverrideAction(subcontractor.id, module.id, !required))}
                    className="font-semibold text-sky-600 hover:text-sky-700"
                  >
                    Mark {required ? "Not Required" : "Required"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="CRM Access">
        <p className="text-sm text-slate-600">
          {crmAccessGranted ? "Growth CRM access is currently granted." : "No CRM access has been granted yet."}
        </p>
        <div className="mt-3 flex items-center gap-3">
          {crmAccessGranted ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => revokeCrmAccessAction(subcontractor.id))}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700"
            >
              Revoke CRM Access
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending || !subcontractor.email}
              onClick={() => runAction(() => grantCrmAccessAction(subcontractor.id))}
              className={buttonClasses}
            >
              Grant CRM Access
            </button>
          )}
        </div>
        {!subcontractor.email && !crmAccessGranted && <p className="mt-2 text-xs text-amber-700">Add an email address before granting access.</p>}

        {permissions && (
          <form action={(formData) => runAction(() => updatePermissionsAction(subcontractor.id, formData))} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div>
              <label className={labelClasses}>CRM Access Level</label>
              <select name="crm_access" defaultValue={permissions.crm_access} className={`${inputClasses} mt-1 max-w-xs`}>
                {SUBCONTRACTOR_CRM_ACCESS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {SUBCONTRACTOR_CRM_ACCESS_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["view_assigned_leads", "View assigned leads"],
                ["add_call_logs", "Add call logs"],
                ["update_lead_status", "Update lead status"],
                ["book_appointments", "Book appointments"],
                ["view_assigned_training", "View assigned training"],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name={name} defaultChecked={Boolean(permissions[name as keyof SubcontractorPermissionsRow])} />
                  {label}
                </label>
              ))}
            </div>
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Save Permissions
            </button>
          </form>
        )}
      </Section>

      <Section title="Audit Log">
        {auditLog.length === 0 ? (
          <p className="text-sm text-slate-500">No audit history yet.</p>
        ) : (
          <ul className="space-y-2 text-xs text-slate-600">
            {auditLog.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="font-semibold text-slate-800">
                  {SUBCONTRACTOR_AUDIT_ACTION_LABELS[entry.action]}{" "}
                  <span className="font-normal text-slate-400">
                    · {entry.performed_by_name} · {new Date(entry.created_at).toLocaleString()}
                  </span>
                </p>
                {entry.reason && <p className="mt-1">Reason: {entry.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

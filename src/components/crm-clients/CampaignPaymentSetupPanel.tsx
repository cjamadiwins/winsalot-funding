"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  LEADGEN_CAMPAIGN_STATUSES,
  LEADGEN_PAYMENT_MODELS,
  LEADGEN_PAYMENT_MODEL_LABELS,
  LEADGEN_PAYMENT_STATUSES,
  LEADGEN_PAYMENT_STATUS_LABELS,
  LEADGEN_MILESTONE_STATUSES,
  LEADGEN_MILESTONE_STATUS_LABELS,
  leadgenPaymentOutstanding,
  type LeadgenCampaignRow,
  type LeadgenCampaignStatus,
  type LeadgenClientPaymentConfigRow,
  type LeadgenClientPaymentMilestoneRow,
} from "@/lib/leadgen-types";

type ActionResult = { error?: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const labelClass = "text-[11.5px] font-semibold uppercase tracking-wide text-slate-500";
const buttonClass = "rounded-full border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primaryButtonClass = "rounded-full bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
const dangerLinkClass = "text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50";

const STATUS_LABELS: Record<LeadgenCampaignStatus, string> = { active: "Active", paused: "Paused", completed: "Completed" };

function formatMoney(value: number | null, currency: string): string {
  if (value === null) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const PAYMENT_STATUS_BADGE_CLASSES: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  paid_in_full: "bg-emerald-100 text-emerald-800",
  overdue: "bg-rose-100 text-rose-800",
  waived: "bg-slate-100 text-slate-700",
};

const MILESTONE_STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  due: "bg-amber-100 text-amber-800",
  received: "bg-emerald-100 text-emerald-800",
};

function CampaignForm({
  campaign,
  onCancel,
  onSubmit,
  isPending,
}: {
  campaign: LeadgenCampaignRow | null;
  onCancel: (() => void) | null;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <form action={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClass}>Campaign Name</label>
        <input name="name" required defaultValue={campaign?.name ?? ""} className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Campaign Type</label>
        <input name="campaign_type" defaultValue={campaign?.campaign_type ?? ""} placeholder="e.g. Standard Monthly" className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Service Being Promoted</label>
        <input name="service_type" defaultValue={campaign?.service_type ?? ""} placeholder="e.g. Website Design Lead Generation" className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Target Industry</label>
        <input name="target_industry" defaultValue={campaign?.target_industry ?? ""} className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Secondary Industries</label>
        <input
          name="secondary_industries"
          defaultValue={campaign?.secondary_industries?.join(", ") ?? ""}
          placeholder="Comma-separated, optional"
          className={`${inputClass} mt-1`}
        />
      </div>
      <div>
        <label className={labelClass}>Territory</label>
        <input name="territory" defaultValue={campaign?.territory ?? ""} placeholder="e.g. Brampton / Mississauga" className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Assigned Team / Agent</label>
        <input name="assigned_team" defaultValue={campaign?.assigned_team ?? ""} placeholder="Optional, shown to client" className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Campaign Start Date</label>
        <input type="date" name="start_date" defaultValue={campaign?.start_date ?? ""} className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Campaign Status</label>
        <select name="status" defaultValue={campaign?.status ?? "active"} className={`${inputClass} mt-1`}>
          {LEADGEN_CAMPAIGN_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Current Campaign Stage</label>
        <input name="current_stage" defaultValue={campaign?.current_stage ?? ""} placeholder="e.g. Prospecting & Booking Consultations" className={`${inputClass} mt-1`} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>Qualified Lead Criteria</label>
        <textarea
          name="qualification_criteria"
          defaultValue={campaign?.qualification_criteria?.join("\n") ?? ""}
          placeholder={"One per line, e.g.\nDecision-maker reached\nCorrect target industry\nConsultation booked"}
          rows={3}
          className={`${inputClass} mt-1`}
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-2">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {campaign ? "Save Campaign Setup" : "Create Campaign"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function PaymentConfigForm({
  config,
  onCancel,
  onSubmit,
  isPending,
}: {
  config: LeadgenClientPaymentConfigRow | null;
  onCancel: (() => void) | null;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <form action={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Payment Model</label>
        <select name="payment_model" defaultValue={config?.payment_model ?? "standard_monthly"} className={`${inputClass} mt-1`}>
          {LEADGEN_PAYMENT_MODELS.map((model) => (
            <option key={model} value={model}>
              {LEADGEN_PAYMENT_MODEL_LABELS[model]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Currency</label>
        <select name="currency" defaultValue={config?.currency ?? "CAD"} className={`${inputClass} mt-1`}>
          <option value="CAD">CAD</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Total Campaign Fee</label>
        <input type="number" step="0.01" min="0" name="total_campaign_fee" defaultValue={config?.total_campaign_fee ?? ""} className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Deposit Required</label>
        <input type="number" step="0.01" min="0" name="deposit_required" defaultValue={config?.deposit_required ?? ""} className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Recurring Monthly Amount</label>
        <input type="number" step="0.01" min="0" name="recurring_monthly_amount" defaultValue={config?.recurring_monthly_amount ?? ""} className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Attribution Period (days)</label>
        <input type="number" step="1" min="0" name="attribution_period_days" defaultValue={config?.attribution_period_days ?? ""} placeholder="e.g. 90" className={`${inputClass} mt-1`} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>Admin Notes</label>
        <textarea name="notes" defaultValue={config?.notes ?? ""} placeholder="Not shown to the client, e.g. Interac e-Transfer details" rows={2} className={`${inputClass} mt-1`} />
      </div>
      <div className="sm:col-span-2 flex items-center gap-2">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {config ? "Save Payment Arrangement" : "Create Payment Setup"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function MilestoneForm({
  milestone,
  onCancel,
  onSubmit,
  isPending,
}: {
  milestone: LeadgenClientPaymentMilestoneRow | null;
  onCancel: () => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <form action={onSubmit} className="mt-2 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Label</label>
        <input name="label" required defaultValue={milestone?.label ?? ""} placeholder="e.g. Deposit, Milestone 1" className={`${inputClass} mt-1`} />
      </div>
      <div>
        <label className={labelClass}>Amount</label>
        <input type="number" step="0.01" min="0" name="amount" defaultValue={milestone?.amount ?? ""} className={`${inputClass} mt-1`} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>Trigger</label>
        <input
          name="trigger_description"
          defaultValue={milestone?.trigger_description ?? ""}
          placeholder="e.g. After first closed deal"
          className={`${inputClass} mt-1`}
        />
      </div>
      <div>
        <label className={labelClass}>Auto-Trigger After Nth Won</label>
        <input
          type="number"
          step="1"
          min="1"
          name="auto_trigger_on_nth_won"
          defaultValue={milestone?.auto_trigger_on_nth_won ?? ""}
          placeholder="Optional"
          className={`${inputClass} mt-1`}
        />
      </div>
      <div>
        <label className={labelClass}>Status</label>
        <select name="status" defaultValue={milestone?.status ?? "pending"} className={`${inputClass} mt-1`}>
          {LEADGEN_MILESTONE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LEADGEN_MILESTONE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 flex items-center gap-2">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {milestone ? "Save Milestone" : "Add Milestone"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type PaymentActions = {
  updatePaymentConfigAction: (crmClientId: string, leadgenClientId: string, configId: string | null, formData: FormData) => Promise<ActionResult>;
  updatePaymentProgressAction: (crmClientId: string, configId: string, formData: FormData) => Promise<ActionResult>;
  markDepositReceivedAction: (crmClientId: string, configId: string) => Promise<ActionResult>;
  updatePaymentMilestoneAction: (crmClientId: string, configId: string, milestoneId: string | null, formData: FormData) => Promise<ActionResult>;
  markMilestoneReceivedAction: (crmClientId: string, milestoneId: string) => Promise<ActionResult>;
  deletePaymentMilestoneAction: (crmClientId: string, milestoneId: string) => Promise<ActionResult>;
};

// "Payment Setup" half of Campaign & Payment Setup (brief sections 7-11).
// Every write here goes through leadgen_client_payment_configs /
// _milestones, whose only write policy is admin_all - there is no client
// (or agent) write path at all, at the database level (see the
// migration's header comment), so this form isn't the only thing
// stopping a client from marking itself paid.
function PaymentSetupSection({
  crmClientId,
  leadgenClientId,
  config,
  milestones,
  actions,
}: {
  crmClientId: string;
  leadgenClientId: string;
  config: LeadgenClientPaymentConfigRow | null;
  milestones: LeadgenClientPaymentMilestoneRow[];
  actions: PaymentActions;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingConfig, setEditingConfig] = useState(false);
  const [editingProgress, setEditingProgress] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, onSuccess: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess();
      router.refresh();
    });
  }

  const outstanding = config ? leadgenPaymentOutstanding(config) : null;

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="text-[13px] font-bold text-slate-900">Payment Setup</h3>

      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

      {!config || editingConfig ? (
        <PaymentConfigForm
          key={config?.id ?? "new"}
          config={config}
          onCancel={config ? () => setEditingConfig(false) : null}
          isPending={isPending}
          onSubmit={(fd) => run(() => actions.updatePaymentConfigAction(crmClientId, leadgenClientId, config?.id ?? null, fd), () => setEditingConfig(false))}
        />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-slate-900">
              <span className="font-semibold">{LEADGEN_PAYMENT_MODEL_LABELS[config.payment_model]}</span>
            </p>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PAYMENT_STATUS_BADGE_CLASSES[config.payment_status]}`}>
              {LEADGEN_PAYMENT_STATUS_LABELS[config.payment_status]}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">Campaign Fee</dt>
              <dd className="text-slate-700">{formatMoney(config.total_campaign_fee, config.currency)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">Deposit</dt>
              <dd className="text-slate-700">
                {config.deposit_required === null ? "—" : `${formatMoney(config.deposit_required, config.currency)} · ${config.deposit_received ? "Received" : "Pending"}`}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">Amount Paid</dt>
              <dd className="text-slate-700">{formatMoney(config.amount_paid, config.currency)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">Outstanding</dt>
              <dd className="text-slate-700">{formatMoney(outstanding, config.currency)}</dd>
            </div>
            {config.recurring_monthly_amount !== null && (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Recurring Monthly</dt>
                <dd className="text-slate-700">{formatMoney(config.recurring_monthly_amount, config.currency)}</dd>
              </div>
            )}
            {config.attribution_period_days !== null && (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Attribution Period</dt>
                <dd className="text-slate-700">{config.attribution_period_days} days</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEditingConfig(true)} className={buttonClass}>
              Edit Arrangement
            </button>
            <button type="button" onClick={() => setEditingProgress((v) => !v)} className={buttonClass}>
              Update Payment Progress
            </button>
            {config.deposit_required !== null && !config.deposit_received && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!confirm("Confirm the deposit has been received?")) return;
                  run(() => actions.markDepositReceivedAction(crmClientId, config.id), () => {});
                }}
                className={buttonClass}
              >
                Confirm Deposit Received
              </button>
            )}
          </div>

          {editingProgress && (
            <form
              action={(fd) => run(() => actions.updatePaymentProgressAction(crmClientId, config.id, fd), () => setEditingProgress(false))}
              className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3"
            >
              <div>
                <label className={labelClass}>Amount Paid</label>
                <input type="number" step="0.01" min="0" name="amount_paid" defaultValue={config.amount_paid} className={`${inputClass} mt-1 w-32`} />
              </div>
              <div>
                <label className={labelClass}>Payment Status</label>
                <select name="payment_status" defaultValue={config.payment_status} className={`${inputClass} mt-1`}>
                  {LEADGEN_PAYMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {LEADGEN_PAYMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={isPending} className={primaryButtonClass}>
                Save
              </button>
              <button type="button" onClick={() => setEditingProgress(false)} className={buttonClass}>
                Cancel
              </button>
            </form>
          )}

          <div className="mt-5">
            <h4 className={labelClass}>Milestones</h4>
            {milestones.length === 0 && !addingMilestone && <p className="mt-2 text-[13px] text-slate-500">No milestones configured.</p>}
            <ul className="mt-2 space-y-2">
              {milestones.map((milestone) =>
                editingMilestoneId === milestone.id ? (
                  <MilestoneForm
                    key={milestone.id}
                    milestone={milestone}
                    onCancel={() => setEditingMilestoneId(null)}
                    isPending={isPending}
                    onSubmit={(fd) => run(() => actions.updatePaymentMilestoneAction(crmClientId, config.id, milestone.id, fd), () => setEditingMilestoneId(null))}
                  />
                ) : (
                  <li key={milestone.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
                    <div>
                      <span className="font-semibold text-slate-900">{milestone.label}</span>
                      <span className="ml-2 text-slate-600">{formatMoney(milestone.amount, config.currency)}</span>
                      {milestone.trigger_description && <span className="ml-2 text-slate-500">· {milestone.trigger_description}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${MILESTONE_STATUS_BADGE_CLASSES[milestone.status]}`}>
                        {LEADGEN_MILESTONE_STATUS_LABELS[milestone.status]}
                      </span>
                      {milestone.status !== "received" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            if (!confirm(`Confirm "${milestone.label}" payment received?`)) return;
                            run(() => actions.markMilestoneReceivedAction(crmClientId, milestone.id), () => {});
                          }}
                          className={buttonClass}
                        >
                          Mark Received
                        </button>
                      )}
                      <button type="button" onClick={() => setEditingMilestoneId(milestone.id)} className={buttonClass}>
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`Remove milestone "${milestone.label}"?`)) return;
                          run(() => actions.deletePaymentMilestoneAction(crmClientId, milestone.id), () => {});
                        }}
                        className={dangerLinkClass}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
            {addingMilestone ? (
              <MilestoneForm
                milestone={null}
                onCancel={() => setAddingMilestone(false)}
                isPending={isPending}
                onSubmit={(fd) => run(() => actions.updatePaymentMilestoneAction(crmClientId, config.id, null, fd), () => setAddingMilestone(false))}
              />
            ) : (
              <button type="button" onClick={() => setAddingMilestone(true)} className={`${buttonClass} mt-2`}>
                + Add Milestone
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Admin-only "Campaign Setup" (Campaign & Payment Setup, Phase 1 - brief
// section 18). Every field here maps to a leadgen_campaigns column whose
// only write policy is leadgen_campaigns_admin_all - agents and clients
// can read what's set here (Lead Gen CRM Agent views / the Client Portal
// dashboard's Campaign Summary card) but have no path to change it, at
// the database level, not just because this form is admin-only.
export default function CampaignPaymentSetupPanel({
  crmClientId,
  leadgenClientId,
  campaigns,
  updateAction,
  paymentConfig,
  paymentMilestones,
  paymentActions,
}: {
  crmClientId: string;
  leadgenClientId: string;
  campaigns: LeadgenCampaignRow[];
  updateAction: (crmClientId: string, leadgenClientId: string, campaignId: string | null, formData: FormData) => Promise<ActionResult>;
  paymentConfig: LeadgenClientPaymentConfigRow | null;
  paymentMilestones: LeadgenClientPaymentMilestoneRow[];
  paymentActions: PaymentActions;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(campaigns.find((c) => c.status === "active")?.id ?? campaigns[0]?.id ?? null);

  const selectedCampaign = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);

  function runAction(campaignId: string | null, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateAction(crmClientId, leadgenClientId, campaignId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      setAddingNew(false);
      router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[15px] font-bold text-slate-900">Campaign & Payment Setup</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Admin-only campaign and payment configuration - clients can view their own payment status (never internal Winsalot commission/margin data), agents can view campaign targeting, but only Admin can change any of it.
      </p>

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

      {campaigns.length > 1 && !addingNew && (
        <div className="mt-4">
          <label className={labelClass}>Editing Campaign</label>
          <select
            value={selectedId ?? ""}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setIsEditing(false);
            }}
            className={`${inputClass} mt-1 max-w-xs`}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {addingNew ? (
        <CampaignForm campaign={null} onCancel={() => setAddingNew(false)} onSubmit={(fd) => runAction(null, fd)} isPending={isPending} />
      ) : campaigns.length === 0 ? (
        <CampaignForm campaign={null} onCancel={null} onSubmit={(fd) => runAction(null, fd)} isPending={isPending} />
      ) : !isEditing ? (
        <div className="mt-4">
          <p className="text-[13px] text-slate-900">
            <span className="font-semibold">{selectedCampaign?.name}</span>
            <span className="ml-2 text-slate-500">({STATUS_LABELS[selectedCampaign?.status ?? "active"]})</span>
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">Target Industry</dt>
              <dd className="text-slate-700">{selectedCampaign?.target_industry || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">Territory</dt>
              <dd className="text-slate-700">{selectedCampaign?.territory || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">Current Stage</dt>
              <dd className="text-slate-700">{selectedCampaign?.current_stage || "—"}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={() => setIsEditing(true)} className={buttonClass}>
              Edit Campaign Setup
            </button>
            <button type="button" onClick={() => setAddingNew(true)} className={buttonClass}>
              + Add another campaign
            </button>
          </div>
        </div>
      ) : (
        <CampaignForm
          key={selectedCampaign?.id}
          campaign={selectedCampaign}
          onCancel={() => setIsEditing(false)}
          onSubmit={(fd) => runAction(selectedCampaign?.id ?? null, fd)}
          isPending={isPending}
        />
      )}

      <PaymentSetupSection
        crmClientId={crmClientId}
        leadgenClientId={leadgenClientId}
        config={paymentConfig}
        milestones={paymentMilestones}
        actions={paymentActions}
      />
    </section>
  );
}

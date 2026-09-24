"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { LEADGEN_CAMPAIGN_STATUSES, type LeadgenCampaignRow, type LeadgenCampaignStatus } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const labelClass = "text-[11.5px] font-semibold uppercase tracking-wide text-slate-500";
const buttonClass = "rounded-full border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primaryButtonClass = "rounded-full bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";

const STATUS_LABELS: Record<LeadgenCampaignStatus, string> = { active: "Active", paused: "Paused", completed: "Completed" };

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
}: {
  crmClientId: string;
  leadgenClientId: string;
  campaigns: LeadgenCampaignRow[];
  updateAction: (crmClientId: string, leadgenClientId: string, campaignId: string | null, formData: FormData) => Promise<ActionResult>;
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
        Admin-only campaign configuration - clients and agents can view this, but only Admin can change it. Payment setup is added here in a later update.
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
    </section>
  );
}

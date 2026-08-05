"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { PROVIDER_INTAKE_URL } from "@/lib/provider-intake-content";
import {
  PROVIDER_ACQUISITION_STAGES,
  PROVIDER_ACQUISITION_STAGE_STYLES,
  PROVIDER_SERVICES_OFFERED,
  PROVIDER_STATUSES,
  PROVIDER_STATUS_STYLES,
  CANADIAN_PROVINCES_AND_TERRITORIES,
  isProviderFollowUpDueToday,
  isProviderFollowUpOverdue,
  isProviderOverdue,
  overdueProviderDurationLabel,
  providerAcquisitionStage,
  type ProviderAcquisitionStage,
  type ProviderFollowUpWithLead,
  type ProviderLeadRow,
  type ProviderStatus,
} from "@/lib/provider-types";
import { deleteProviderLeadAction, sendProviderIntakeEmailAction, updateProviderStatusAction } from "./actions";

// Same 6-stage grouping and colours as the admin Provider Acquisition
// dashboard (/admin/crm and /admin/crm/provider-acquisition) - both read
// from the exact same providerAcquisitionStage()/PROVIDER_ACQUISITION_STAGE_STYLES
// in lib/provider-types.ts, so the two views can never show different
// colours for the same stage. No admin-only actions here - this is a
// read-only summary plus the same search/filter/status controls this
// page already had.
export default function ProviderAcquisitionAgentClient({
  providers,
  followUps,
}: {
  providers: ProviderLeadRow[];
  followUps: ProviderFollowUpWithLead[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProviderStatus | "all">("all");
  const [stageFilter, setStageFilter] = useState<ProviderAcquisitionStage | "all">("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [provinceFilter, setProvinceFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendSuccessId, setSendSuccessId] = useState<string | null>(null);

  const stageCounts = useMemo(() => {
    const counts = new Map<ProviderAcquisitionStage, number>();
    for (const stage of PROVIDER_ACQUISITION_STAGES) counts.set(stage, 0);
    for (const provider of providers) {
      const stage = providerAcquisitionStage(provider);
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return counts;
  }, [providers]);

  const stats: { label: string; value: number; colorClass: string }[] = [
    { label: "New Interested Leads", value: stageCounts.get("New Interested Lead") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["New Interested Lead"] },
    { label: "Due Today", value: followUps.filter(isProviderFollowUpDueToday).length, colorClass: "bg-amber-100 text-amber-800" },
    { label: "Overdue", value: followUps.filter(isProviderFollowUpOverdue).length, colorClass: "bg-rose-100 text-rose-800" },
    { label: "Quote Forms Sent", value: stageCounts.get("Quote Form Sent") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Quote Form Sent"] },
    { label: "Quote Forms Incomplete", value: stageCounts.get("Quote Form Incomplete") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Quote Form Incomplete"] },
    { label: "Qualified Providers", value: stageCounts.get("Qualified Provider") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Qualified Provider"] },
    { label: "Closed – Won", value: stageCounts.get("Closed – Won") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Closed – Won"] },
    { label: "Closed – Lost", value: stageCounts.get("Closed – Lost") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Closed – Lost"] },
  ];

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  async function handleCopyLink(id: string) {
    try {
      await navigator.clipboard.writeText(PROVIDER_INTAKE_URL);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      // Clipboard access can fail silently; the link is shown on the
      // detail page as a fallback.
    }
  }

  function handleSendIntake(provider: ProviderLeadRow) {
    if (!provider.email) return;
    if (!confirm(`Send the provider intake form email to ${provider.email}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await sendProviderIntakeEmailAction(provider.id);
      if (result.error) setError(result.error);
      else setSendSuccessId(provider.id);
    });
  }

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return providers.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (stageFilter !== "all" && providerAcquisitionStage(p) !== stageFilter) return false;
      if (serviceFilter !== "all" && !p.services_offered.includes(serviceFilter)) return false;
      if (provinceFilter !== "all" && p.province !== provinceFilter) return false;
      if (!query) return true;
      return (
        p.business_name.toLowerCase().includes(query) ||
        (p.contact_person ?? "").toLowerCase().includes(query) ||
        p.phone.toLowerCase().includes(query) ||
        (p.email ?? "").toLowerCase().includes(query) ||
        p.city.toLowerCase().includes(query) ||
        p.province.toLowerCase().includes(query) ||
        p.services_offered.some((s) => s.toLowerCase().includes(query))
      );
    });
  }, [providers, query, statusFilter, stageFilter, serviceFilter, provinceFilter]);

  return (
    <div>
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-xl p-3.5 ${stat.colorClass}`}>
            <div className="text-[9.5px] font-semibold uppercase tracking-wide opacity-80">{stat.label}</div>
            <div className="mt-1 text-lg font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, contact, phone, email, city..."
          className="w-full max-w-sm rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProviderStatus | "all")}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All statuses</option>
          {PROVIDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as ProviderAcquisitionStage | "all")}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All stages</option>
          {PROVIDER_ACQUISITION_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All services</option>
          {PROVIDER_SERVICES_OFFERED.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
        <select
          value={provinceFilter}
          onChange={(e) => setProvinceFilter(e.target.value)}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All provinces</option>
          {CANADIAN_PROVINCES_AND_TERRITORIES.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </select>
      </div>

      {providers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No provider leads yet.{" "}
          <Link href="/agent/provider-acquisition/new" className="font-semibold text-[var(--color-accent)]">
            Add your first provider lead
          </Link>{" "}
          to get started.
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No provider leads match your search.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((provider) => (
            <div
              key={provider.id}
              className={`rounded-xl border p-4 ${
                isProviderOverdue(provider)
                  ? "border-red-200 bg-red-50"
                  : "border-[var(--color-border)] bg-[var(--color-input-bg)]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Link
                    href={
                      provider.cleaning_provider_id
                        ? `/agent/providers/${provider.cleaning_provider_id}`
                        : `/agent/provider-acquisition/${provider.id}`
                    }
                    className="font-semibold text-[var(--color-ink-strong)] hover:text-[var(--color-accent)]"
                  >
                    {provider.business_name}
                  </Link>
                  {provider.cleaning_provider_id && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      Approved
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <select
                    value={provider.status}
                    disabled={isPending}
                    onChange={(e) => runAction(() => updateProviderStatusAction(provider.id, e.target.value))}
                    className={`rounded-full border-none px-2.5 py-1 text-[11px] font-semibold ${PROVIDER_STATUS_STYLES[provider.status]}`}
                  >
                    {PROVIDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROVIDER_ACQUISITION_STAGE_STYLES[providerAcquisitionStage(provider)]}`}
                  >
                    {providerAcquisitionStage(provider)}
                  </span>
                </span>
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                {provider.contact_person ? `${provider.contact_person} · ` : ""}
                {provider.phone} · {provider.city}, {provider.province}
              </div>
              {provider.services_offered.length > 0 && (
                <div className="mt-1.5 text-[12px] text-[var(--color-text-muted)]">
                  {provider.services_offered.join(", ")}
                </div>
              )}
              {provider.next_follow_up_at && (
                <div
                  className={`mt-2 text-[12.5px] font-medium ${
                    isProviderOverdue(provider) ? "text-red-700" : "text-[var(--color-text-muted)]"
                  }`}
                >
                  Next follow-up: {new Date(provider.next_follow_up_at).toLocaleString()}
                  {isProviderOverdue(provider) && ` — ${overdueProviderDurationLabel(provider.next_follow_up_at)}`}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href={
                    provider.cleaning_provider_id
                      ? `/agent/providers/${provider.cleaning_provider_id}`
                      : `/agent/provider-acquisition/${provider.id}`
                  }
                  className="text-[12.5px] font-semibold text-[var(--color-accent)]"
                >
                  View Provider
                </Link>
                <button
                  type="button"
                  disabled={isPending || !provider.email}
                  onClick={() => handleSendIntake(provider)}
                  className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Intake Form
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyLink(provider.id)}
                  className="text-[12.5px] font-semibold text-[var(--color-ink-mute)]"
                >
                  {copiedId === provider.id ? "Provider intake link copied." : "Copy Intake Link"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (confirm(`Delete "${provider.business_name}"? This cannot be undone.`)) {
                      runAction(() => deleteProviderLeadAction(provider.id));
                    }
                  }}
                  className="text-[12.5px] font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete Lead
                </button>
              </div>
              {sendSuccessId === provider.id && (
                <p className="mt-2 text-[12.5px] font-medium text-emerald-700">
                  Intake form email sent to {provider.email}.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

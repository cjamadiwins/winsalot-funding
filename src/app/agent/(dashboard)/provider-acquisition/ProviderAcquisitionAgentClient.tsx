"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { PROVIDER_INTAKE_URL } from "@/lib/provider-intake-content";
import {
  PROVIDER_SERVICES_OFFERED,
  PROVIDER_STATUSES,
  PROVIDER_STATUS_STYLES,
  CANADIAN_PROVINCES_AND_TERRITORIES,
  isProviderOverdue,
  overdueProviderDurationLabel,
  type ProviderLeadRow,
  type ProviderStatus,
} from "@/lib/provider-types";
import { deleteProviderLeadAction, sendProviderIntakeEmailAction, updateProviderStatusAction } from "./actions";

export default function ProviderAcquisitionAgentClient({ providers }: { providers: ProviderLeadRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProviderStatus | "all">("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [provinceFilter, setProvinceFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendSuccessId, setSendSuccessId] = useState<string | null>(null);

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
  }, [providers, query, statusFilter, serviceFilter, provinceFilter]);

  return (
    <div>
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

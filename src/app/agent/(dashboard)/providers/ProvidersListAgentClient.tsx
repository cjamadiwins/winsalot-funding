"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CLEANING_PROVIDER_STATUS_STYLES, PROVIDER_SCORE_RATING_STYLES, type CleaningProviderRow } from "@/lib/provider-types";

export default function ProvidersListAgentClient({ providers }: { providers: CleaningProviderRow[] }) {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return providers;
    return providers.filter(
      (p) =>
        p.company_name.toLowerCase().includes(query) ||
        (p.contact_person ?? "").toLowerCase().includes(query) ||
        (p.email ?? "").toLowerCase().includes(query) ||
        (p.phone ?? "").toLowerCase().includes(query) ||
        (p.city ?? "").toLowerCase().includes(query)
    );
  }, [providers, query]);

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, contact, phone, email, city..."
        className="mt-6 w-full max-w-sm rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
      />

      {providers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No providers assigned to you yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No providers match your search.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((provider) => (
            <div key={provider.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/agent/providers/${provider.id}`}
                  className="font-semibold text-[var(--color-ink-strong)] hover:text-[var(--color-accent)]"
                >
                  {provider.company_name}
                </Link>
                <div className="flex items-center gap-2">
                  {provider.score !== null && provider.score_label && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        PROVIDER_SCORE_RATING_STYLES[provider.score_label as keyof typeof PROVIDER_SCORE_RATING_STYLES]
                      }`}
                    >
                      {provider.score} · {provider.score_label}
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${CLEANING_PROVIDER_STATUS_STYLES[provider.status]}`}>
                    {provider.status}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                {provider.contact_person ? `${provider.contact_person} · ` : ""}
                {[provider.phone, provider.city, provider.province].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

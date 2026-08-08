"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CLEANING_PROVIDER_STATUS_STYLES,
  PROVIDER_SCORE_RATING_STYLES,
  type CleaningProviderRow,
} from "@/lib/provider-types";
import { SCORE_FILTER_OPTIONS, matchesScoreFilter, sortByScore, type ScoreFilter } from "@/lib/provider-score-filters";
import type { CrmUserRow } from "@/lib/crm-types";
import { setProviderStatusAction } from "./actions";

export default function ProvidersListAdminClient({
  providers,
  agents,
}: {
  providers: CleaningProviderRow[];
  agents: CrmUserRow[];
}) {
  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [sortBy, setSortBy] = useState<"none" | "score_desc" | "score_asc">("none");

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const matches = providers.filter((p) => {
      if (!matchesScoreFilter(p, scoreFilter)) return false;
      if (!query) return true;
      return (
        p.company_name.toLowerCase().includes(query) ||
        (p.contact_person ?? "").toLowerCase().includes(query) ||
        (p.email ?? "").toLowerCase().includes(query) ||
        (p.phone ?? "").toLowerCase().includes(query) ||
        (p.city ?? "").toLowerCase().includes(query)
      );
    });
    return sortBy === "none" ? matches : sortByScore(matches, sortBy);
  }, [providers, query, scoreFilter, sortBy]);

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, contact, phone, email, city..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <select value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value as ScoreFilter)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm">
          {SCORE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "none" | "score_desc" | "score_asc")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="none">Sort: Company name</option>
          <option value="score_desc">Sort: Score high to low</option>
          <option value="score_asc">Sort: Score low to high</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone / Email</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((provider) => {
              const agent = provider.assigned_agent_id ? agentById.get(provider.assigned_agent_id) : null;
              return (
                <tr key={provider.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/admin/providers/${provider.id}`} className="hover:text-sky-600">
                      {provider.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{provider.contact_person ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {[provider.phone, provider.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{agent?.full_name || agent?.email || "Unassigned"}</td>
                  <td className="px-4 py-3">
                    {provider.score !== null && provider.score_label ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          PROVIDER_SCORE_RATING_STYLES[provider.score_label as keyof typeof PROVIDER_SCORE_RATING_STYLES]
                        }`}
                      >
                        {provider.score} · {provider.score_label}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CLEANING_PROVIDER_STATUS_STYLES[provider.status]}`}>
                      {provider.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form
                      action={setProviderStatusAction.bind(
                        null,
                        provider.id,
                        provider.status === "active" ? "inactive" : "active"
                      )}
                    >
                      <button type="submit" className="text-xs font-medium text-sky-600 hover:text-sky-700">
                        {provider.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No providers match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

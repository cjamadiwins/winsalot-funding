"use client";

import { useState, useTransition } from "react";
import {
  PROVIDER_SCORE_RATING_STYLES,
  providerAdjustedScore,
  type ProviderScoreAdjustmentRow,
  type ProviderScoreBreakdown,
} from "@/lib/provider-types";

// Provider Scorecard (brief "PROVIDER SCORECARD" + "SCORECARD
// TRANSPARENCY") - the score is never shown as an unexplained number:
// clicking it always reveals every category, points earned/available, the
// data used, and recommended improvements.
export default function ProviderScorecardCard({
  score,
  label,
  breakdown,
  missingCategories,
  isNewProvider,
  calculatedAt,
  adjustments,
  isAdmin,
  onAddAdjustment,
  onRecalculate,
}: {
  score: number | null;
  label: string | null;
  breakdown: ProviderScoreBreakdown | null;
  missingCategories: string[];
  isNewProvider: boolean;
  calculatedAt: string | null;
  adjustments: ProviderScoreAdjustmentRow[];
  isAdmin: boolean;
  onAddAdjustment?: (formData: FormData) => Promise<{ error?: string } | void>;
  onRecalculate?: () => Promise<{ error?: string } | void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  const adjustedScore = score !== null ? providerAdjustedScore(score, adjustments) : null;
  const ratingStyle = label ? PROVIDER_SCORE_RATING_STYLES[label as keyof typeof PROVIDER_SCORE_RATING_STYLES] : undefined;

  return (
    <section id="scorecard" className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Provider Scorecard</h2>
        {isAdmin && onRecalculate && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(onRecalculate)}
            className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700 disabled:opacity-50"
          >
            Recalculate Score
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}

      {score === null ? (
        <p className="mt-3 text-[13.5px] text-slate-500">Score has not been calculated yet.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="text-4xl font-bold text-slate-900">{adjustedScore}</div>
            {label && (
              <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${ratingStyle}`}>{label}</span>
            )}
            {adjustments.length > 0 && (
              <span className="text-[12px] text-slate-500">(calculated {score}, adjusted {adjustedScore})</span>
            )}
          </div>

          {isNewProvider && (
            <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2 text-[13px] font-medium text-sky-800">
              New Provider — Limited Performance Data
            </p>
          )}

          {calculatedAt && (
            <p className="mt-2 text-[12px] text-slate-500">
              Last calculated {new Date(calculatedAt).toLocaleString()}
            </p>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-[13px] font-semibold text-sky-600 hover:text-sky-700"
          >
            {expanded ? "Hide score breakdown" : "View score breakdown"}
          </button>

          {expanded && breakdown && (
            <div className="mt-3 space-y-3">
              {breakdown.categories.map((cat) => (
                <div key={cat.category} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-slate-900">{cat.category}</span>
                    <span className="text-[12.5px] font-medium text-slate-600">
                      {cat.applicable ? `${cat.pointsEarned} / ${cat.pointsAvailable} pts` : "Not applicable yet"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-[12.5px] text-slate-600">
                    {cat.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                  {cat.recommendations.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[12.5px] text-amber-700">
                      {cat.recommendations.map((r, i) => (
                        <li key={i}>→ {r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {missingCategories.length > 0 && (
                <p className="text-[12.5px] text-slate-500">
                  Categories awaiting data: {missingCategories.join(", ")}.
                </p>
              )}
            </div>
          )}

          {(adjustments.length > 0 || isAdmin) && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                  Manual Adjustments
                </h3>
                {isAdmin && onAddAdjustment && (
                  <button
                    type="button"
                    onClick={() => setShowAdjustmentForm((v) => !v)}
                    className="text-[12.5px] font-semibold text-sky-600"
                  >
                    {showAdjustmentForm ? "Cancel" : "+ Add Adjustment"}
                  </button>
                )}
              </div>

              {adjustments.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-slate-500">No manual adjustments recorded.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {adjustments.map((adj) => (
                    <li key={adj.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px]">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${adj.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {adj.amount >= 0 ? "+" : ""}
                          {adj.amount} pts
                        </span>
                        <span className="text-slate-500">{new Date(adj.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 text-slate-700">{adj.reason}</p>
                    </li>
                  ))}
                </ul>
              )}

              {showAdjustmentForm && onAddAdjustment && (
                <form
                  action={(formData) => {
                    runAction(() => onAddAdjustment(formData));
                    setShowAdjustmentForm(false);
                  }}
                  className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3"
                >
                  <input
                    type="number"
                    name="amount"
                    placeholder="Adjustment amount (e.g. -5 or 5)"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
                  />
                  <textarea
                    name="reason"
                    placeholder="Written reason (required)"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
                  />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-full bg-sky-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-700"
                  >
                    Save Adjustment
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

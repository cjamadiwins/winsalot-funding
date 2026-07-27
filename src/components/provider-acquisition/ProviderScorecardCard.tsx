"use client";

import { useState, useTransition } from "react";
import {
  MANUAL_SCORECARD_COUNTER_FIELDS,
  MANUAL_SCORECARD_COUNTER_LABELS,
  MANUAL_SCORECARD_RATING_CATEGORIES,
  MANUAL_SCORECARD_RATING_LABELS,
  MANUAL_SCORECARD_STATUS_STYLES,
  PROVIDER_SCORE_RATING_STYLES,
  providerAdjustedScore,
  type CleaningProviderRow,
  type ManualScorecardCounterField,
  type ManualScorecardRatingCategory,
  type ProviderScoreAdjustmentRow,
  type ProviderScoreBreakdown,
} from "@/lib/provider-types";

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

// Provider Scorecard (brief "PROVIDER SCORECARD" + "SCORECARD
// TRANSPARENCY") - two systems in one card: an administrator-editable
// manual scorecard (1-5 quality ratings, operational counters, notes -
// this file's newer half) sitting above the pre-existing automatically
// calculated activity score (unchanged below). The automatic score is
// never shown as an unexplained number: clicking it always reveals every
// category, points earned/available, the data used, and recommended
// improvements.
export default function ProviderScorecardCard({
  provider,
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
  onUpdateScorecard,
}: {
  provider: Pick<
    CleaningProviderRow,
    | "quote_response_speed_rating"
    | "pricing_competitiveness_rating"
    | "service_quality_rating"
    | "reliability_rating"
    | "communication_rating"
    | "customer_satisfaction_rating"
    | "jobs_assigned_count"
    | "quotes_submitted_count"
    | "quotes_approved_count"
    | "jobs_completed_count"
    | "cancellation_no_show_count"
    | "scorecard_notes"
    | "manual_score"
    | "manual_score_label"
    | "manual_score_updated_at"
  >;
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
  onUpdateScorecard?: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [editingScorecard, setEditingScorecard] = useState(false);
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
  const manualStatusStyle = provider.manual_score_label ? MANUAL_SCORECARD_STATUS_STYLES[provider.manual_score_label] : undefined;

  const ratingValues: Record<ManualScorecardRatingCategory, number | null> = {
    quote_response_speed: provider.quote_response_speed_rating,
    pricing_competitiveness: provider.pricing_competitiveness_rating,
    service_quality: provider.service_quality_rating,
    reliability: provider.reliability_rating,
    communication: provider.communication_rating,
    customer_satisfaction: provider.customer_satisfaction_rating,
  };

  const counterValues: Record<ManualScorecardCounterField, number> = {
    jobs_assigned_count: provider.jobs_assigned_count,
    quotes_submitted_count: provider.quotes_submitted_count,
    quotes_approved_count: provider.quotes_approved_count,
    jobs_completed_count: provider.jobs_completed_count,
    cancellation_no_show_count: provider.cancellation_no_show_count,
  };

  return (
    <section id="scorecard" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Provider Scorecard</h2>
        {isAdmin && onUpdateScorecard && (
          <button
            type="button"
            onClick={() => setEditingScorecard((v) => !v)}
            className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700"
          >
            {editingScorecard ? "Cancel" : "Edit Scorecard"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}

      {/* Overall Provider Score - derived from the manual 1-5 ratings below. */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="text-4xl font-bold text-slate-900">
          {provider.manual_score ?? "—"}
          <span className="text-base font-medium text-slate-400">/100</span>
        </div>
        {provider.manual_score_label && (
          <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${manualStatusStyle}`}>
            {provider.manual_score_label}
          </span>
        )}
      </div>
      {provider.manual_score === null && (
        <p className="mt-1 text-[13px] text-slate-500">Not yet rated by an administrator.</p>
      )}
      {provider.manual_score_updated_at && (
        <p className="mt-1 text-[12px] text-slate-500">
          Last updated {new Date(provider.manual_score_updated_at).toLocaleString()}
        </p>
      )}

      {editingScorecard && onUpdateScorecard ? (
        <form
          action={(formData) => {
            runAction(() => onUpdateScorecard(formData));
            setEditingScorecard(false);
          }}
          className="mt-4 space-y-4 rounded-xl border border-slate-200 p-4"
        >
          <div>
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Quality Ratings (1–5)</h3>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MANUAL_SCORECARD_RATING_CATEGORIES.map((category) => (
                <label key={category} className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">{MANUAL_SCORECARD_RATING_LABELS[category]}</span>
                  <select
                    name={`${category}_rating`}
                    defaultValue={ratingValues[category] ?? ""}
                    className={inputClass}
                  >
                    <option value="">Not rated</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Activity Counts</h3>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MANUAL_SCORECARD_COUNTER_FIELDS.map((field) => (
                <label key={field} className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">{MANUAL_SCORECARD_COUNTER_LABELS[field]}</span>
                  <input
                    type="number"
                    name={field}
                    min="0"
                    step="1"
                    defaultValue={counterValues[field]}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Internal Scorecard Notes</span>
            <textarea
              name="scorecard_notes"
              defaultValue={provider.scorecard_notes ?? ""}
              className={`${inputClass} min-h-[70px] resize-y`}
            />
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700"
          >
            Save Scorecard
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Quality Ratings</h3>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
              {MANUAL_SCORECARD_RATING_CATEGORIES.map((category) => (
                <RatingRow key={category} label={MANUAL_SCORECARD_RATING_LABELS[category]} value={ratingValues[category]} />
              ))}
            </dl>
          </div>
          <div>
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Activity Counts</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-3">
              {MANUAL_SCORECARD_COUNTER_FIELDS.map((field) => (
                <div key={field} className="flex flex-col">
                  <dt className="text-[11px] text-slate-500">{MANUAL_SCORECARD_COUNTER_LABELS[field]}</dt>
                  <dd className="font-semibold text-slate-900">{provider[field]}</dd>
                </div>
              ))}
            </dl>
          </div>
          {provider.scorecard_notes && (
            <div>
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Internal Scorecard Notes</h3>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-slate-700">{provider.scorecard_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Automatic Activity Score - pre-existing system, unchanged. */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Automatic Activity Score</h3>
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

        {score === null ? (
          <p className="mt-3 text-[13.5px] text-slate-500">Score has not been calculated yet.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="text-2xl font-bold text-slate-900">{adjustedScore}</div>
              {label && <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${ratingStyle}`}>{label}</span>}
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
                  <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                    Manual Adjustments
                  </h4>
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
      </div>
    </section>
  );
}

function RatingRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-50 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value !== null ? `${value} / 5` : "Not rated"}</dd>
    </div>
  );
}

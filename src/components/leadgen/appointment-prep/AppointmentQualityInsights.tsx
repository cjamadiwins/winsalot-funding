import { MIN_FEEDBACK_FOR_INSIGHTS, type CountedLabel, type FeedbackMetrics, type QualityInsights } from "@/lib/leadgen-appointment-prep";

function CountList({ title, items, empty }: { title: string; items: CountedLabel[]; empty: string }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-0.5 text-[12.5px] text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-0.5 space-y-0.5 text-[12.5px] text-slate-700">
          {items.map((item) => (
            <li key={item.label} className="flex justify-between gap-2">
              <span>{item.label}</span>
              <span className="font-semibold text-slate-900">×{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const METRIC_LABELS: [keyof FeedbackMetrics, string][] = [
  ["appointmentsCompleted", "Appts Completed"],
  ["feedbackReceived", "Feedback Received"],
  ["strongOrGood", "Strong / Good"],
  ["followUpsRequired", "Follow-Ups"],
  ["proposalsOrQuotes", "Proposals / Quotes"],
  ["secondMeetings", "Second Meetings"],
  ["customersWon", "Customers Won"],
  ["notQualified", "Not Qualified"],
  ["noShows", "No Shows"],
];

// Admin-only. Every figure is a plain count of recorded client feedback -
// nothing is inferred, and nothing here changes campaign criteria, lists,
// assignments or scripts.
export default function AppointmentQualityInsights({ metrics, insights }: { metrics: FeedbackMetrics; insights: QualityInsights }) {
  const enough = insights.feedbackCount >= MIN_FEEDBACK_FOR_INSIGHTS;
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] px-5 py-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appointment Quality Insights</h2>
      <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {METRIC_LABELS.map(([key, label]) => (
          <div key={key} className="rounded-lg bg-slate-50 px-2 py-1.5">
            <dd className="text-[16px] font-bold leading-tight text-slate-900">{metrics[key]}</dd>
            <dt className="text-[10.5px] leading-tight text-slate-500">{label}</dt>
          </div>
        ))}
      </dl>

      {insights.feedbackCount === 0 ? (
        <p className="mt-2 text-[12.5px] text-slate-500">No client feedback has been recorded yet.</p>
      ) : !enough ? (
        <p className="mt-2 text-[12.5px] text-slate-500">
          {insights.feedbackCount} feedback record{insights.feedbackCount === 1 ? "" : "s"} so far - insights appear once at least {MIN_FEEDBACK_FOR_INSIGHTS} are recorded.
        </p>
      ) : (
        <details className="mt-2" open>
          <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-700">Recorded feedback ({insights.feedbackCount})</summary>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CountList title="Most common qualification issues" items={insights.topFitIssues} empty="None recorded" />
            <CountList title="Why appointments didn't progress" items={insights.nonProgressReasons} empty="None recorded" />
            <CountList title="Industries with Strong / Good ratings" items={insights.strongIndustries} empty="Not enough data" />
            <CountList title="Locations with Strong / Good ratings" items={insights.strongLocations} empty="Not enough data" />
          </div>
          {insights.recentClientNotes.length > 0 && (
            <div className="mt-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent client notes (verbatim)</h4>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-slate-700">
                {insights.recentClientNotes.map((note) => (
                  <li key={note.appointmentId}>{note.note}</li>
                ))}
              </ul>
            </div>
          )}
          {insights.preferences.length > 0 && (
            <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Recent Client Preferences · informational only</h4>
              <ul className="mt-0.5 space-y-0.5 text-[12.5px] text-slate-700">
                {insights.preferences.map((p) => (
                  <li key={p.label}>
                    • {p.label} <span className="text-slate-400">(from {p.count} recorded {p.count === 1 ? "issue" : "issues"})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
    </section>
  );
}

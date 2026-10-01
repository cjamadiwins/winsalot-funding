import type { ClientBriefView } from "@/lib/leadgen-appointment-prep";
import OpportunitySnapshot from "./OpportunitySnapshot";
import MeetingGuide from "./MeetingGuide";

// The client-facing Appointment Brief. Takes ONLY the client-safe
// ClientBriefView plus the prospect overview from the appointment the
// client already owns - it has no way to render internal notes, agent
// information or CRM metadata because none are ever passed in.
export default function ClientBriefPanel({
  brief,
  overview,
}: {
  brief: ClientBriefView;
  overview: { businessName: string; contactName: string | null; phone: string | null; email: string | null; website: string | null; industry: string | null };
}) {
  const overviewItems = [
    ["Business", overview.businessName],
    ["Contact", overview.contactName],
    ["Phone", overview.phone],
    ["Email", overview.email],
    ["Website", overview.website],
    ["Industry", overview.industry],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <div className="space-y-3 text-[13px] text-slate-700">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prospect Overview</h3>
        <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {overviewItems.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-400">{label}</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <OpportunitySnapshot interestLevel={brief.interest_level} primaryNeed={brief.primary_opportunity} objective={brief.recommended_objective} />

      {brief.why_interested && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why They Agreed to Meet</h3>
          <p className="mt-0.5">{brief.why_interested}</p>
        </section>
      )}

      {brief.appointment_summary && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Important Notes</h3>
          <p className="mt-0.5 whitespace-pre-line">{brief.appointment_summary}</p>
        </section>
      )}

      {brief.talking_points.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recommended Talking Points</h3>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
            {brief.talking_points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.suggested_questions.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-700">Suggested Questions ({brief.suggested_questions.length})</summary>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
            {brief.suggested_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </details>
      )}

      <MeetingGuide />

      {brief.recommended_next_step && (
        <section className="rounded-xl bg-sky-50 px-3 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Recommended Next Step</h3>
          <p className="mt-0.5 font-semibold text-slate-900">{brief.recommended_next_step}</p>
          {brief.next_step_note && <p className="text-slate-600">{brief.next_step_note}</p>}
        </section>
      )}
    </div>
  );
}

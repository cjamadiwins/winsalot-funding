import { detectCommunicationPreferences } from "@/lib/leadgen-client-notification";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";

// Prominent per-lead contact instruction (e.g. "EMAIL ONLY — DO NOT CALL"),
// shown on the lead page and in the Email Client composer. Appears only when
// THIS lead's own notes/status say so, and quotes the note it was read from.
// Display only: it never changes a lead, creates a call or blocks an action.
export default function CommunicationPreferenceBanner({ lead, className = "" }: { lead: Pick<LeadgenLeadRow, "status" | "notes" | "client_notes" | "source_notes">; className?: string }) {
  const preferences = detectCommunicationPreferences(lead);
  if (preferences.length === 0) return null;
  return (
    <div role="note" className={`rounded-lg border-2 border-rose-300 bg-rose-50 px-4 py-3 ${className}`}>
      {preferences.map((pref) => (
        <div key={pref.kind}>
          <p className="text-[15px] font-extrabold tracking-wide text-rose-800">{pref.label}</p>
          <p className="mt-0.5 text-[12.5px] text-rose-700">From lead note: “{pref.evidence}”</p>
        </div>
      ))}
    </div>
  );
}

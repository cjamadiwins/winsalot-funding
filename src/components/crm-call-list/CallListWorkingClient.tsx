"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Rocket } from "lucide-react";
import { CALL_LOG_OUTCOMES, CALL_LOG_OUTCOME_STYLES, type CallLogOutcome } from "@/lib/call-log";
import { isColumnHidden } from "@/lib/call-list-columns";
import { locationLines } from "@/lib/call-list-card-location";
import type { CallListLeadRow } from "@/lib/call-list-types";

// Deliberately per-lead, one-at-a-time (no row selection, no "export"/
// "copy all" affordance, no CSV/bulk endpoint reachable from this view -
// bulk export and CSV download are Admin-only, see
// SegmentPerformanceClient's export link) - agents work a list lead by
// lead. Business name/contact/phone/email are still rendered as plain
// selectable text (never inputs styled read-only, never any
// user-select/clipboard restriction) so an agent can freely copy/paste a
// single field into the existing Call Log or elsewhere in the CRM; only
// bulk/administrative capabilities are restricted here, never normal
// per-field copying.
//
// hiddenFields (from the Admin "Manage Columns" setting) hides a field
// the same way the Admin's own spreadsheet views do - business_name
// always stays visible here regardless, since it's this card's only
// identifier for which lead the agent is looking at. Every other core
// calling field (contact name, phone, email, website, industry, notes,
// call outcome, callback) is visible by default and only ever hidden if
// Admin explicitly hides it - an empty/never-configured hiddenFields
// list (the default state) hides nothing, and "Reset to Default" in
// Manage Columns never hides any of these, only imported extra_fields
// columns - see defaultHiddenColumnFields in call-list-columns.ts.
export default function CallListWorkingClient({
  leads,
  logCallAction,
  promoteAction,
  hiddenFields,
}: {
  leads: CallListLeadRow[];
  logCallAction: (leadId: string, formData: FormData) => Promise<{ error?: string }>;
  promoteAction: (leadId: string) => Promise<{ error?: string; id?: string; linkedExisting?: boolean }>;
  hiddenFields: string[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "not_contacted">("not_contacted");
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Record<string, string>>({});

  const visibleLeads = filter === "not_contacted" ? leads.filter((l) => !l.last_outcome) : leads;
  const showContact = !isColumnHidden(hiddenFields, "contact_name");
  const showPhone = !isColumnHidden(hiddenFields, "phone");
  const showEmail = !isColumnHidden(hiddenFields, "email");
  const showWebsite = !isColumnHidden(hiddenFields, "website");
  const showIndustry = !isColumnHidden(hiddenFields, "industry");
  const showStreetAddress = !isColumnHidden(hiddenFields, "street_address");
  const showCity = !isColumnHidden(hiddenFields, "city");
  const showProvince = !isColumnHidden(hiddenFields, "province");
  const showPostalCode = !isColumnHidden(hiddenFields, "postal_code");
  const showNotes = !isColumnHidden(hiddenFields, "notes");
  const showOutcome = !isColumnHidden(hiddenFields, "last_outcome");
  const showCallback = !isColumnHidden(hiddenFields, "callback_at");

  function handleSubmit(leadId: string, formData: FormData) {
    setNotice((prev) => ({ ...prev, [leadId]: "" }));
    startTransition(async () => {
      const result = await logCallAction(leadId, formData);
      if (result.error) {
        setNotice((prev) => ({ ...prev, [leadId]: result.error! }));
      } else {
        setOpenId(null);
        router.refresh();
      }
    });
  }

  function handlePromote(leadId: string) {
    startTransition(async () => {
      const result = await promoteAction(leadId);
      setNotice((prev) => ({ ...prev, [leadId]: result.error ?? (result.linkedExisting ? "Linked to an existing record." : "Promoted.") }));
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12.5px]">
        <button
          type="button"
          onClick={() => setFilter("not_contacted")}
          className={`rounded-full px-3 py-1 ${filter === "not_contacted" ? "bg-[var(--color-accent)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}
        >
          Not yet contacted
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 ${filter === "all" ? "bg-[var(--color-accent)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}
        >
          All ({leads.length})
        </button>
      </div>

      {visibleLeads.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-muted)]">
          Nothing left in this view.
        </div>
      )}

      <div className="space-y-2">
        {visibleLeads.map((lead) => {
          const promotedId = lead.promoted_opportunity_id || lead.promoted_leadgen_lead_id;
          return (
            <div key={lead.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-[var(--color-ink-strong)]">
                    {lead.business_name}
                    {lead.dnc_flag && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-semibold text-rose-800">DNC</span>}
                  </div>
                  {(showContact || showPhone) && (
                    <div className="text-[12.5px] text-[var(--color-text-muted)]">
                      {showContact && lead.contact_name ? `${lead.contact_name} · ` : ""}
                      {showPhone ? (lead.phone ?? "No phone") : ""}
                    </div>
                  )}
                  {((showEmail && lead.email) || (showWebsite && lead.website)) && (
                    <div className="text-[12.5px] text-[var(--color-text-muted)]">
                      {showEmail && lead.email ? lead.email : ""}
                      {showEmail && lead.email && showWebsite && lead.website ? " · " : ""}
                      {showWebsite && lead.website ? lead.website : ""}
                    </div>
                  )}
                  {locationLines(lead, { showStreetAddress, showCity, showProvince, showPostalCode }).map((line) => (
                    <div key={line} className="text-[12px] text-[var(--color-text-muted)]">
                      {line}
                    </div>
                  ))}
                  {showIndustry && lead.industry && <div className="text-[12.5px] text-[var(--color-text-muted)]">{lead.industry}</div>}
                  {showOutcome && lead.last_outcome && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${CALL_LOG_OUTCOME_STYLES[lead.last_outcome as CallLogOutcome] ?? "bg-slate-100 text-slate-700"}`}>
                      {lead.last_outcome}
                    </span>
                  )}
                  {showCallback && lead.callback_at && (
                    <p className="mt-1 text-[12px] text-orange-700">Callback: {new Date(lead.callback_at).toLocaleString()}</p>
                  )}
                  {showNotes && lead.notes && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{lead.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {promotedId ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Promoted</span>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handlePromote(lead.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-muted)] hover:border-[var(--color-accent)]"
                    >
                      <Rocket className="h-3 w-3" /> Promote
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === lead.id ? null : lead.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 py-1 text-[12px] font-semibold text-white"
                  >
                    <PhoneCall className="h-3.5 w-3.5" /> Log Call
                  </button>
                </div>
              </div>

              {notice[lead.id] && <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">{notice[lead.id]}</p>}

              {openId === lead.id && (
                <form
                  action={(formData) => handleSubmit(lead.id, formData)}
                  className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--color-border)] pt-3 sm:grid-cols-2"
                >
                  <label className="block text-[12.5px] sm:col-span-1">
                    <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Outcome</span>
                    <select name="outcome" required defaultValue="" className="w-full rounded-lg border border-[var(--color-input-border)] px-2.5 py-1.5 text-[13px]">
                      <option value="" disabled>
                        Select…
                      </option>
                      {CALL_LOG_OUTCOMES.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {outcome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[12.5px]">
                    <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Callback Date/Time</span>
                    <input type="datetime-local" name="callback_at" className="w-full rounded-lg border border-[var(--color-input-border)] px-2.5 py-1.5 text-[13px]" />
                  </label>
                  <label className="block text-[12.5px]">
                    <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Appointment Date/Time</span>
                    <input type="datetime-local" name="appointment_at" className="w-full rounded-lg border border-[var(--color-input-border)] px-2.5 py-1.5 text-[13px]" />
                  </label>
                  <label className="block text-[12.5px] sm:col-span-2">
                    <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Notes</span>
                    <textarea name="notes" rows={2} className="w-full rounded-lg border border-[var(--color-input-border)] px-2.5 py-1.5 text-[13px]" />
                  </label>
                  <div className="sm:col-span-2">
                    <button type="submit" disabled={isPending} className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
                      {isPending ? "Saving…" : "Save Call"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

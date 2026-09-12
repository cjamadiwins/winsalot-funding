"use client";

import { useState, useTransition } from "react";
import { PhoneCall, Sparkles } from "lucide-react";
import LargeModal from "@/components/crm-ui/LargeModal";
import { OPPORTUNITY_CATEGORY_LABELS, OPPORTUNITY_CATEGORY_STYLES, effectiveOpportunityCategory } from "@/lib/opportunity-finder";
import type { LeadgenAgentLeadDetailData } from "@/lib/leadgen-agent-lead-detail-data";
import LeadgenMyOpportunitiesClient, { type LeadgenMyOpportunityRow } from "./LeadgenMyOpportunitiesClient";
import LeadDetailClient, { type LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { getLeadgenAgentLeadDetailForModalAction } from "../leads/[id]/actions";

type ActionResult = { error?: string };

// Agent dashboard entry point into "My Opportunities" for the Lead
// Generation CRM (this CRM's Opportunity Finder for an agent - the
// standalone page is still available as a fallback). Opens the exact same
// scored list (LeadgenMyOpportunitiesClient, unchanged logic - RLS already
// restricts every row to this agent) in a large centered modal; "View
// Lead" swaps the modal to that lead's full detail (LeadDetailClient, same
// component/actions the standalone /leadgen/agent/leads/[id] page uses)
// fetched on demand, with a score explanation panel above it since the
// standalone agent page has never shown that (Opportunity Finder scores
// are otherwise admin-only).
export default function OpportunityFinderModalTrigger({
  rows,
  currentUserName,
  currentUserId,
  actions,
  onAddNote,
  onScheduleCallback,
  onCompleteFollowUp,
  hotCount,
}: {
  rows: LeadgenMyOpportunityRow[];
  currentUserName: string;
  currentUserId: string;
  actions: LeadDetailActions;
  onAddNote: (leadId: string, note: string) => Promise<ActionResult>;
  onScheduleCallback: (leadId: string, formData: FormData) => Promise<ActionResult>;
  onCompleteFollowUp: (followUpId: string, leadId: string) => Promise<ActionResult>;
  hotCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadgenAgentLeadDetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }

  function viewDetail(leadId: string) {
    setSelectedId(leadId);
    setDetail(null);
    setDetailError(null);
    startTransition(async () => {
      const result = await getLeadgenAgentLeadDetailForModalAction(leadId);
      if ("error" in result) setDetailError(result.error);
      else setDetail(result);
    });
  }

  function backToList() {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-indigo-600 p-2.5 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[16px] font-bold text-slate-900">Opportunity Finder</div>
            <div className="mt-0.5 text-[12.5px] text-slate-600">Your own leads ranked 0-100, without leaving your dashboard.</div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-[12px] font-bold text-red-800">
          <PhoneCall className="h-3.5 w-3.5" /> {hotCount} Hot
        </span>
      </button>

      <LargeModal
        open={open}
        onClose={close}
        title={selectedId ? undefined : "Opportunity Finder"}
        subtitle={selectedId ? undefined : "Your own leads ranked 0-100, with why the CRM flagged each one and what to do next."}
        headerLeft={
          selectedId ? (
            <button type="button" onClick={backToList} className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
              ← Back to Opportunities
            </button>
          ) : undefined
        }
        footer={
          <>
            <span className="text-[12px] text-slate-500">{rows.length} scored opportunit{rows.length === 1 ? "y" : "ies"}</span>
            <button type="button" onClick={close} className="rounded-lg bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white">
              Close
            </button>
          </>
        }
      >
        {selectedId ? (
          detailError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{detailError}</p>
          ) : isPending || !detail ? (
            <p className="py-10 text-center text-sm text-slate-400">Loading lead…</p>
          ) : (
            <>
              {detail.score && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-slate-900">{detail.score.score}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OPPORTUNITY_CATEGORY_STYLES[effectiveOpportunityCategory(detail.score)]}`}>
                      {OPPORTUNITY_CATEGORY_LABELS[effectiveOpportunityCategory(detail.score)]}
                    </span>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12.5px] text-slate-600">
                    {detail.score.reasons.slice(0, 3).map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-[12.5px] font-semibold text-slate-800">{detail.score.recommended_action}</div>
                </div>
              )}
              <LeadDetailClient
                lead={detail.lead}
                client={detail.client!}
                campaign={detail.campaign}
                agents={[]}
                assignedAgentName={currentUserName}
                currentUserName={currentUserName}
                currentUserId={currentUserId}
                activities={detail.activities}
                followUps={detail.followUps}
                appointments={detail.appointments}
                automaticReminderStatusByAppointmentId={detail.automaticReminderStatusByAppointmentId}
                smsReminderStatusByAppointmentId={detail.smsReminderStatusByAppointmentId}
                emails={detail.emails}
                consultationTemplate={detail.consultationTemplate}
                consultationInvitationTemplate={detail.consultationInvitationTemplate}
                consultationFollowUpTemplate={detail.consultationFollowUpTemplate}
                mantraCollabTemplate={detail.mantraCollabTemplate}
                followUpTemplates={detail.followUpTemplates}
                bookingLink={detail.bookingLink}
                servicesInfoLink={detail.servicesInfoLink}
                bouncedEmails={detail.bouncedEmails}
                isAdmin={false}
                actions={actions}
                listPath="/leadgen/agent/leads"
                onBack={backToList}
              />
            </>
          )
        ) : (
          <LeadgenMyOpportunitiesClient
            rows={rows}
            onAddNote={onAddNote}
            onScheduleCallback={onScheduleCallback}
            onCompleteFollowUp={onCompleteFollowUp}
            onViewDetail={viewDetail}
          />
        )}
      </LargeModal>
    </>
  );
}

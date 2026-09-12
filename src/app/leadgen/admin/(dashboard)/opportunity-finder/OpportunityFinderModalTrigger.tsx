"use client";

import { useState, useTransition } from "react";
import { PhoneCall, Sparkles } from "lucide-react";
import LargeModal from "@/components/crm-ui/LargeModal";
import type { LeadgenLeadDetailData } from "@/lib/leadgen-lead-detail-data";
import LeadDetailClient, { type LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import LeadgenOpportunityFinderClient, { type LeadgenOpportunityFinderRow } from "./LeadgenOpportunityFinderClient";
import { getLeadgenLeadDetailForModalAction } from "./actions";

type ActionResult = { error?: string };

// Dashboard entry point into the Opportunity Finder for the Lead
// Generation CRM's admin - opens the exact same scoring, filters,
// List/Board views, and actions the standalone
// /leadgen/admin/opportunity-finder page renders
// (LeadgenOpportunityFinderClient, unchanged logic) inside a large
// centered modal instead of navigating away from the dashboard. Clicking
// a business name or "View Lead" swaps the modal to that lead's full
// detail (LeadDetailClient - the same component/actions the standalone
// /leadgen/admin/leads/[id] page uses) fetched on demand via
// getLeadgenLeadDetailForModalAction, with a "Back to Opportunities"
// button returning to the list. The standalone page stays untouched as a
// fallback.
export default function OpportunityFinderModalTrigger({
  rows,
  agents,
  clients,
  campaigns,
  industries,
  currentUserName,
  currentUserId,
  actions,
  onAddNote,
  onScheduleCallback,
  onCompleteFollowUp,
  hotCount,
}: {
  rows: LeadgenOpportunityFinderRow[];
  agents: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  campaigns: { id: string; name: string; clientId: string }[];
  industries: string[];
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
  const [detail, setDetail] = useState<LeadgenLeadDetailData | null>(null);
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
      const result = await getLeadgenLeadDetailForModalAction(leadId);
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
            <div className="mt-0.5 text-[12.5px] text-slate-600">Every lead ranked 0-100, without leaving your dashboard.</div>
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
        subtitle={selectedId ? undefined : "Every lead already in the CRM, scored 0-100 from real calls, emails, notes, follow-ups, and appointments on file."}
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
            <LeadDetailClient
              lead={detail.lead}
              client={detail.client!}
              campaign={detail.campaign}
              agents={detail.agents}
              assignedAgentName={detail.assignedAgentName}
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
              isAdmin
              actions={actions}
              listPath="/leadgen/admin/leads"
              score={detail.score}
              onBack={backToList}
            />
          )
        ) : (
          <LeadgenOpportunityFinderClient
            rows={rows}
            agents={agents}
            clients={clients}
            campaigns={campaigns}
            industries={industries}
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin, Target, Rocket, ListChecks } from "lucide-react";
import type { LeadgenBuiltCallScript } from "@/lib/leadgen-call-script";
import ClientCallScriptPanel from "./ClientCallScriptPanel";

export type AssignedCampaignCardData = {
  campaignId: string;
  clientName: string;
  status: string;
  launchDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  servicesDescription: string | null;
  targetGeography: string | null;
  appointmentTarget: string | null;
  qualifiedLeadDefinition: string[];
  clientInstructions: string | null;
  callScript: LeadgenBuiltCallScript;
  trainingHref: string;
  segments: { id: string; name: string }[];
  segmentHrefBase: string;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  draft: "bg-slate-100 text-slate-600",
  completed: "bg-sky-100 text-sky-800",
  archived: "bg-slate-200 text-slate-600",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  // Plain YYYY-MM-DD date column - parse as a local calendar date (not UTC
  // midnight) so the displayed day never shifts a day earlier/later
  // depending on the viewer's timezone.
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// "Current campaigns" overview for the agent dashboard - one clickable card
// per campaign this agent is assigned to (see leadgen_campaign_agents /
// leadgen_agent_campaign_allowed via the same restrictedCampaignIds/
// activeClientIds filtering the page already uses for
// ClientCallScriptSelector, so this can never show a campaign the agent
// isn't authorized to work). Distinct from AgentCampaignSelector (the
// existing "Current Business" single-select picker) - this section is a
// read-only summary of every assigned campaign at once, reusing the exact
// same call-script builder/renderer (ClientCallScriptPanel) rather than
// duplicating script content, and linking out to the existing Training page
// and Call List Segment pages rather than duplicating that content either.
export default function AssignedCampaignsCard({ campaigns }: { campaigns: AssignedCampaignCardData[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(campaigns.length === 1 ? campaigns[0].campaignId : null);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Your Current Campaigns</h2>
      <p className="mt-1 text-[13px] text-slate-500">
        Click a campaign to see its call script, instructions, and training.
      </p>

      {campaigns.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">No campaigns are currently assigned to you.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {campaigns.map((campaign) => {
            const isOpen = expandedId === campaign.campaignId;
            const launchLabel = formatDate(campaign.launchDate);
            const endLabel = formatDate(campaign.endDate);
            const statusClass = STATUS_STYLES[campaign.status] ?? "bg-slate-100 text-slate-600";

            return (
              <div key={campaign.campaignId} className="overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/70">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : campaign.campaignId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold text-slate-900">{campaign.clientName}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${statusClass}`}>{campaign.status}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
                      {launchLabel && (
                        <span className="inline-flex items-center gap-1">
                          <Rocket className="h-3.5 w-3.5 text-sky-600" /> Launch: {launchLabel}
                          {endLabel ? ` – ${endLabel}` : ""}
                        </span>
                      )}
                      {campaign.targetGeography && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-sky-600" /> {campaign.targetGeography}
                        </span>
                      )}
                      {campaign.appointmentTarget != null && (
                        <span className="inline-flex items-center gap-1">
                          <Target className="h-3.5 w-3.5 text-sky-600" /> {campaign.appointmentTarget} appointments target
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-sky-200 bg-white p-4">
                    {campaign.servicesDescription && (
                      <div>
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Services Being Promoted</p>
                        <p className="mt-1 text-[13.5px] text-slate-700">{campaign.servicesDescription}</p>
                      </div>
                    )}

                    <div>
                      <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                        <ListChecks className="h-3.5 w-3.5" /> Qualified Lead Definition
                      </p>
                      {campaign.qualifiedLeadDefinition.length > 0 ? (
                        <ul className="mt-1 list-inside list-disc text-[13.5px] text-slate-700">
                          {campaign.qualifiedLeadDefinition.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-[13px] text-slate-400">Not yet defined by Admin.</p>
                      )}
                    </div>

                    {campaign.clientInstructions && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-700">Client-Specific Instructions</p>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] text-amber-900">{campaign.clientInstructions}</p>
                      </div>
                    )}

                    <ClientCallScriptPanel script={campaign.callScript} compact />

                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Assigned Call List</p>
                      {campaign.segments.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {campaign.segments.map((segment) => (
                            <Link
                              key={segment.id}
                              href={`${campaign.segmentHrefBase}/${segment.id}`}
                              className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700"
                            >
                              {segment.name}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[13px] text-slate-400">No call list assigned yet.</p>
                      )}
                    </div>

                    <Link href={campaign.trainingHref} className="inline-block text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
                      Open Campaign Training →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

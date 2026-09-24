import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LEADGEN_PIPELINE_STAGES,
  derivePipelineStage,
  type LeadgenLeadRow,
  type LeadgenAppointmentRow,
  type LeadgenCampaignRow,
  type LeadgenClientOpportunityRow,
} from "@/lib/leadgen-types";
import PipelineOutcomeForm from "@/components/leadgen/PipelineOutcomeForm";
import { submitOpportunityOutcomeAction } from "./actions";

const STAGE_BADGE_CLASSES: Record<string, string> = {
  Contacted: "bg-slate-100 text-slate-700",
  Interested: "bg-indigo-100 text-indigo-800",
  "Consultation Booked": "bg-sky-100 text-sky-800",
  "Consultation Completed": "bg-amber-100 text-amber-800",
  "Proposal Sent": "bg-violet-100 text-violet-800",
  Won: "bg-emerald-100 text-emerald-800",
  Lost: "bg-rose-100 text-rose-800",
};

// Proposal Status (attribution field, brief #12) is derived straight from
// client_outcome - never a separate stored column, so it can't drift.
function proposalStatusLabel(outcome: LeadgenClientOpportunityRow["client_outcome"]): string {
  if (outcome === "Pending" || outcome === "Follow-Up Needed") return "Not sent";
  return outcome === "Won" || outcome === "Lost" ? "Sent" : outcome;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// "Opportunity Pipeline" (brief section 5) + "Client Consultation
// Outcome" (section 6) + "Attribution Tracking" (section 12) in one page.
// Stage counts cover the WHOLE funnel (derived live from leads/
// appointments/opportunities, never stored); the table below only lists
// actual opportunities (Consultation Completed onward) since that's the
// only part with an editable outcome or attribution detail to show. Every
// row here belongs to this client only - RLS (leadgen_leads_client_select_own
// / leadgen_appointments_client_select_own /
// leadgen_client_opportunities_client_select_own) is the real boundary,
// the .eq("client_id", ...) filters below are defense in depth.
export default async function ClientPortalPipelinePage() {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const [{ data: leads }, { data: appointments }, { data: opportunities }, { data: campaigns }] = await Promise.all([
    supabase.from("leadgen_leads").select("*").eq("client_id", client.id),
    supabase.from("leadgen_appointments").select("*").eq("client_id", client.id),
    supabase.from("leadgen_client_opportunities").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    supabase.from("leadgen_campaigns").select("*").eq("client_id", client.id),
  ]);

  const allLeads = (leads ?? []) as LeadgenLeadRow[];
  const allAppointments = (appointments ?? []) as LeadgenAppointmentRow[];
  const allOpportunities = (opportunities ?? []) as LeadgenClientOpportunityRow[];
  const allCampaigns = (campaigns ?? []) as LeadgenCampaignRow[];
  const campaignNameById = new Map(allCampaigns.map((c) => [c.id, c.name]));

  const appointmentsByLead = new Map<string, LeadgenAppointmentRow[]>();
  for (const appt of allAppointments) {
    if (!appt.lead_id) continue;
    const list = appointmentsByLead.get(appt.lead_id) ?? [];
    list.push(appt);
    appointmentsByLead.set(appt.lead_id, list);
  }
  // Most recent opportunity per lead - a lead could in principle have more
  // than one completed consultation over time; only the latest drives the
  // stage/outcome shown here (opportunities are already ordered by
  // created_at desc above).
  const opportunityByLead = new Map<string, LeadgenClientOpportunityRow>();
  for (const opp of allOpportunities) {
    if (!opportunityByLead.has(opp.lead_id)) opportunityByLead.set(opp.lead_id, opp);
  }

  const stageCounts = new Map<string, number>(LEADGEN_PIPELINE_STAGES.map((s) => [s, 0]));
  for (const lead of allLeads) {
    const stage = derivePipelineStage(lead, appointmentsByLead.get(lead.id) ?? [], opportunityByLead.get(lead.id) ?? null);
    if (stage) stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  }

  const leadById = new Map(allLeads.map((l) => [l.id, l]));
  const appointmentById = new Map(allAppointments.map((a) => [a.id, a]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
      <p className="mt-1 text-sm text-slate-500">How your leads are progressing, from first contact through won or lost business.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {LEADGEN_PIPELINE_STAGES.map((stage) => (
          <span key={stage} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${STAGE_BADGE_CLASSES[stage]}`}>
            {stage} · {stageCounts.get(stage) ?? 0}
          </span>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {allOpportunities.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No consultations completed yet - opportunities appear here automatically once one is.</p>
        ) : (
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Business</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Lead Created</th>
                <th className="p-3">Appointment Date</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Proposal Status</th>
                <th className="p-3">Closed / Value</th>
                <th className="p-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {allOpportunities.map((opp) => {
                const lead = leadById.get(opp.lead_id);
                const appt = opp.appointment_id ? appointmentById.get(opp.appointment_id) : null;
                return (
                  <tr key={opp.id} className="border-b border-slate-100 align-top">
                    <td className="p-3 font-semibold text-slate-900">{lead?.business_name ?? "—"}</td>
                    <td className="p-3 text-slate-600">
                      {lead?.contact_name && <div>{lead.contact_name}</div>}
                      {lead?.phone && <div className="text-[12px] text-slate-500">{lead.phone}</div>}
                    </td>
                    <td className="p-3 text-slate-600">{formatDate(lead?.created_at ?? null)}</td>
                    <td className="p-3 text-slate-600">{appt ? `${appt.appointment_date} ${appt.appointment_time}` : "—"}</td>
                    <td className="p-3 text-slate-600">{opp.campaign_id ? campaignNameById.get(opp.campaign_id) ?? "—" : "—"}</td>
                    <td className="p-3 text-slate-600">{proposalStatusLabel(opp.client_outcome)}</td>
                    <td className="p-3 text-slate-600">
                      {opp.client_outcome === "Won" ? (
                        <>
                          {formatDate(opp.closed_date)}
                          {opp.deal_value !== null && <div className="text-[12px] text-slate-500">${opp.deal_value.toLocaleString()}</div>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">
                      <PipelineOutcomeForm
                        opportunityId={opp.id}
                        currentOutcome={opp.client_outcome}
                        currentClosedDate={opp.closed_date}
                        currentDealValue={opp.deal_value}
                        submitAction={submitOpportunityOutcomeAction}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isHiddenLeadgenCampaignName, type LeadgenLeadRow } from "@/lib/leadgen-types";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import LeadgenOpportunityFinderClient, { type LeadgenOpportunityFinderRow } from "./LeadgenOpportunityFinderClient";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenAdminOpportunityFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; agent?: string; client?: string; followup?: string }>;
}) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { category, agent, client, followup } = await searchParams;

  const [{ data: scores }, { data: leads }, { data: agents }, { data: clients }, { data: campaigns }, { data: notes }] = await Promise.all([
    admin.from("leadgen_opportunity_scores").select("*").order("score", { ascending: false }),
    admin.from("leadgen_leads").select("*"),
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
    admin.from("leadgen_clients").select("id, name").order("name"),
    admin.from("leadgen_campaigns").select("id, name, client_id").order("name"),
    admin
      .from("leadgen_lead_activities")
      .select("lead_id, notes, occurred_at")
      .not("notes", "is", null)
      .order("occurred_at", { ascending: true }),
  ]);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l as LeadgenLeadRow]));
  const agentById = new Map((agents ?? []).map((a) => [a.id, a]));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));
  const lastNoteByLead = new Map<string, { notes: string; occurred_at: string }>();
  for (const row of notes ?? []) {
    if (row.lead_id && row.notes) lastNoteByLead.set(row.lead_id, { notes: row.notes, occurred_at: row.occurred_at });
  }

  const rows: LeadgenOpportunityFinderRow[] = (scores ?? [])
    .map((s): LeadgenOpportunityFinderRow | null => {
      const score = s as LeadgenOpportunityScoreRow;
      const lead = leadById.get(score.lead_id);
      if (!lead) return null;
      const lastNote = lastNoteByLead.get(score.lead_id) ?? null;
      const agentRow = lead.assigned_agent_id ? agentById.get(lead.assigned_agent_id) ?? null : null;
      const signals = score.signals as { last_call_at?: string | null; last_email_activity_at?: string | null };
      return {
        score,
        businessName: lead.business_name,
        contactName: lead.contact_name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        assignedAgentId: lead.assigned_agent_id,
        assignedAgentName: agentRow?.full_name || agentRow?.email || null,
        clientId: lead.client_id,
        clientName: clientById.get(lead.client_id)?.name ?? null,
        campaignId: lead.campaign_id,
        campaignName: lead.campaign_id ? campaignById.get(lead.campaign_id)?.name ?? null : null,
        nextFollowUpAt: lead.next_follow_up_at,
        lastCallAt: signals.last_call_at ?? null,
        lastEmailAt: signals.last_email_activity_at ?? null,
        lastNote: lastNote?.notes ?? null,
        detailHref: `/leadgen/admin/leads/${lead.id}`,
      };
    })
    .filter((r): r is LeadgenOpportunityFinderRow => r !== null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opportunity Finder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every lead already in the CRM, scored 0-100 from real calls, emails, notes, follow-ups, and appointments on file.
          </p>
        </div>
        <Link href="/leadgen/admin" className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400">
          ← Back to Dashboard
        </Link>
      </div>

      <LeadgenOpportunityFinderClient
        rows={rows}
        agents={(agents ?? []).map((a) => ({ id: a.id, name: a.full_name || a.email }))}
        clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
        campaigns={(campaigns ?? []).filter((c) => !isHiddenLeadgenCampaignName(c.name)).map((c) => ({ id: c.id, name: c.name, clientId: c.client_id }))}
        initialCategory={category}
        initialAgentFilter={agent}
        initialClientFilter={client}
        initialFollowUpFilter={followup}
      />
    </div>
  );
}

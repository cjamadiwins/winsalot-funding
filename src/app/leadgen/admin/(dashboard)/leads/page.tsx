import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isHiddenLeadgenCampaignName, type LeadgenCampaignRow, type LeadgenClientRow, type LeadgenLeadRow, type LeadgenUserRow } from "@/lib/leadgen-types";
import LeadsListClient from "./LeadsListClient";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenLeadsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { deleted } = await searchParams;

  const [{ data: leads }, { data: clients }, { data: campaigns }, { data: agents }] = await Promise.all([
    admin.from("leadgen_leads").select("*").order("created_at", { ascending: false }),
    admin.from("leadgen_clients").select("*").order("name"),
    admin.from("leadgen_campaigns").select("*").order("name"),
    admin.from("leadgen_users").select("*").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
      <p className="mt-1 text-sm text-slate-500">Every prospect across every client and campaign.</p>

      <LeadsListClient
        leads={(leads ?? []) as LeadgenLeadRow[]}
        clients={(clients ?? []) as LeadgenClientRow[]}
        campaigns={((campaigns ?? []).filter((campaign) => !isHiddenLeadgenCampaignName(campaign.name))) as LeadgenCampaignRow[]}
        agents={(agents ?? []) as LeadgenUserRow[]}
        initialSuccessMessage={deleted === "1" ? "Lead deleted successfully." : null}
      />
    </div>
  );
}

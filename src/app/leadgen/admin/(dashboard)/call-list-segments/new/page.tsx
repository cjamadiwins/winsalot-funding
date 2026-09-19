import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listGoogleConnections } from "@/lib/call-list-connections";
import NewSegmentClient from "@/components/crm-call-list/NewSegmentClient";
import { createSegmentAction, loadSheetPreviewAction, loadSheetTabsAction } from "../actions";

export default async function NewCallListSegmentPage({
  searchParams,
}: {
  searchParams: Promise<{ googleConnectionId?: string; googleConnectError?: string }>;
}) {
  await requireLeadgenAdmin();
  const { googleConnectionId, googleConnectError } = await searchParams;

  const admin = getSupabaseAdmin();
  const [connections, agentsResult, campaignsResult] = await Promise.all([
    listGoogleConnections("lead_generation"),
    admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
    admin.from("leadgen_campaigns").select("id, name, client_id").eq("status", "active").order("name"),
  ]);

  const agents = ((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));

  const campaigns = (campaignsResult.data ?? []) as { id: string; name: string; client_id: string }[];
  const clientIds = [...new Set(campaigns.map((c) => c.client_id))];
  const { data: clients } = clientIds.length
    ? await admin.from("leadgen_clients").select("id, name").in("id", clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const typeOptions = campaigns.map((c) => ({
    value: c.id,
    label: `${clientNameById.get(c.client_id) ?? "Unknown Client"} — ${c.name}`,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">New Call List Segment</h1>
      <p className="mt-1 text-sm text-slate-500">
        Lead Generation CRM · Admin-only. Set up the segment, then connect the Google Sheet tab it will sync from.
      </p>

      <div className="mt-6">
        <NewSegmentClient
          listHref="/leadgen/admin/call-list-segments"
          connectOAuthHref={`/api/google/oauth/connect?returnTo=${encodeURIComponent("/leadgen/admin/call-list-segments/new")}`}
          initialConnectionId={googleConnectionId}
          connectError={googleConnectError}
          connections={connections.map((c) => ({ id: c.id, googleEmail: c.google_email }))}
          agents={agents}
          typeOptions={typeOptions}
          typeFieldLabel="Campaign"
          loadSheetTabsAction={loadSheetTabsAction}
          loadSheetPreviewAction={loadSheetPreviewAction}
          createSegmentAction={createSegmentAction}
        />
      </div>
    </div>
  );
}
